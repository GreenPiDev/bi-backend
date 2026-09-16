import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/core/filters/http-exception.filter';
import { PrismaService } from '../src/core/prisma/prisma.service';
import { cleanupTestTenants } from './support/cleanup-tenants';
import { inviteUserWithNoPermissions } from './support/roles';

describe('TitleOptions (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const emailSuffix = `-${randomUUID()}@test.com`;
  const ownerEmail = `owner${emailSuffix}`;
  const password = 'sifre1234';

  let tenantId: string;
  let cookies: string[];
  let titleOptionId: string;

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
        tenantName: 'Tenant Title',
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

  it('POST /title-options yeni unvan ekler', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/title-options')
      .set('Cookie', cookies)
      .send({ label: 'Genel Mudur' });
    expect(res.status).toBe(201);
    titleOptionId = res.body.id as string;
  });

  it('POST /title-options ayni etiket icin 409 doner', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/title-options')
      .set('Cookie', cookies)
      .send({ label: 'Genel Mudur' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TITLE_ALREADY_EXISTS');
  });

  it('GET /title-options listede yeni unvani doner', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/title-options')
      .set('Cookie', cookies);
    expect(res.status).toBe(200);
    expect((res.body as { label: string }[]).map((s) => s.label)).toContain(
      'Genel Mudur',
    );
  });

  it('tanimli unvan disinda deger ile kisi olusturulamaz (400 INVALID_TITLE)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/contacts')
      .set('Cookie', cookies)
      .send({ firstName: 'Ayse', lastName: 'Yilmaz', title: 'Uzman' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_TITLE');
  });

  it('izinsiz kullanici unvan ekleyemez (403)', async () => {
    const viewerCookies = await inviteUserWithNoPermissions(
      app,
      cookies,
      `viewer${emailSuffix}`,
    );

    const res = await request(app.getHttpServer())
      .post('/api/v1/title-options')
      .set('Cookie', viewerCookies)
      .send({ label: 'Uzman' });
    expect(res.status).toBe(403);
  });

  it('DELETE /title-options/:id siler', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/v1/title-options/${titleOptionId}`)
      .set('Cookie', cookies);
    expect(res.status).toBe(204);
  });
});
