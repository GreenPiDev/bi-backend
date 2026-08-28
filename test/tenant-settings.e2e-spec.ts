import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/core/filters/http-exception.filter';
import { PrismaService } from '../src/core/prisma/prisma.service';
import { cleanupTestTenants } from './support/cleanup-tenants';

describe('TenantSettings (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const emailSuffix = `-${randomUUID()}@test.com`;
  const ownerEmail = `owner${emailSuffix}`;
  const password = 'sifre1234';

  let tenantId: string;
  let cookies: string[];

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
        tenantName: 'Tenant Settings',
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

  it('GET /tenant-settings varsayilan degerleri doner', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/tenant-settings')
      .set('Cookie', cookies);
    expect(res.status).toBe(200);
    expect(res.body).toContainEqual({
      key: 'crm.contactInactivityThresholdDays',
      value: 180,
      isDefault: true,
    });
  });

  it('PATCH /tenant-settings/:key gecersiz deger icin 400 doner', async () => {
    const res = await request(app.getHttpServer())
      .patch('/api/v1/tenant-settings/crm.contactInactivityThresholdDays')
      .set('Cookie', cookies)
      .send({ value: -1 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_SETTING_VALUE');
  });

  it('PATCH /tenant-settings/:key esigi gunceller', async () => {
    const res = await request(app.getHttpServer())
      .patch('/api/v1/tenant-settings/crm.contactInactivityThresholdDays')
      .set('Cookie', cookies)
      .send({ value: 90 });
    expect(res.status).toBe(200);
    expect(res.body.value).toBe(90);

    const getRes = await request(app.getHttpServer())
      .get('/api/v1/tenant-settings/crm.contactInactivityThresholdDays')
      .set('Cookie', cookies);
    expect(getRes.body).toEqual({
      key: 'crm.contactInactivityThresholdDays',
      value: 90,
      isDefault: false,
    });
  });

  it('bilinmeyen anahtar icin 404 doner', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/tenant-settings/bilinmeyen.anahtar')
      .set('Cookie', cookies);
    expect(res.status).toBe(404);
  });

  it('VIEWER ayar degistiremez (403)', async () => {
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
      .patch('/api/v1/tenant-settings/crm.contactInactivityThresholdDays')
      .set('Cookie', viewerCookies)
      .send({ value: 30 });
    expect(res.status).toBe(403);
  });
});
