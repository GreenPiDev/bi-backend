import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/core/filters/http-exception.filter';
import { PrismaService } from '../src/core/prisma/prisma.service';
import { cleanupTestTenants } from './support/cleanup-tenants';

describe('SectorOptions (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const emailSuffix = `-${randomUUID()}@test.com`;
  const ownerEmail = `owner${emailSuffix}`;
  const password = 'sifre1234';

  let tenantId: string;
  let cookies: string[];
  let sectorOptionId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);

    const register = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        tenantName: 'Tenant Sector',
        name: 'Owner',
        email: ownerEmail,
        password,
      });
    tenantId = register.body.user.tenantId as string;
    cookies = register.headers['set-cookie'] as unknown as string[];

    await prisma.tenantModule.create({
      data: { tenantId, moduleKey: 'crm' },
    });
  }, 30_000);

  afterAll(async () => {
    await cleanupTestTenants(prisma, emailSuffix);
    await app.close();
  });

  it('POST /sector-options yeni sektor ekler', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/sector-options')
      .set('Cookie', cookies)
      .send({ label: 'Yazilim' });
    expect(res.status).toBe(201);
    sectorOptionId = res.body.id as string;
  });

  it('POST /sector-options ayni etiket icin 409 doner', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/sector-options')
      .set('Cookie', cookies)
      .send({ label: 'Yazilim' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SECTOR_ALREADY_EXISTS');
  });

  it('GET /sector-options listede yeni sektoru doner', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/sector-options')
      .set('Cookie', cookies);
    expect(res.status).toBe(200);
    expect((res.body as { label: string }[]).map((s) => s.label)).toContain(
      'Yazilim',
    );
  });

  it('tanimli sektor disinda deger ile firma olusturulamaz (400 INVALID_SECTOR)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .set('Cookie', cookies)
      .send({ name: 'Acme A.S.', sector: 'Tarim' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_SECTOR');
  });

  it('VIEWER sektor ekleyemez (403)', async () => {
    const inviteRes = await request(app.getHttpServer())
      .post('/api/v1/users/invite')
      .set('Cookie', cookies)
      .send({ email: `viewer${emailSuffix}`, role: 'VIEWER' });
    const token = inviteRes.body.token as string;
    const acceptRes = await request(app.getHttpServer())
      .post(`/api/v1/invitations/${token}/accept`)
      .send({ name: 'Viewer', password });
    const viewerCookies = acceptRes.headers['set-cookie'] as unknown as
      string[] | undefined;
    if (!viewerCookies) {
      throw new Error('Davet kabul edilemedi, cookie alinamadi.');
    }

    const res = await request(app.getHttpServer())
      .post('/api/v1/sector-options')
      .set('Cookie', viewerCookies)
      .send({ label: 'Tarim' });
    expect(res.status).toBe(403);
  });

  it('DELETE /sector-options/:id siler', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/v1/sector-options/${sectorOptionId}`)
      .set('Cookie', cookies);
    expect(res.status).toBe(204);
  });
});
