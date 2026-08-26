import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/core/filters/http-exception.filter';
import { PrismaService } from '../src/core/prisma/prisma.service';
import { cleanupTestTenants } from './support/cleanup-tenants';

describe('Platform admin (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const emailSuffix = `-${randomUUID()}@test.com`;
  const adminEmail = `platform-admin${emailSuffix}`;
  const normalEmail = `normal-owner${emailSuffix}`;
  const password = 'sifre1234';

  let adminTenantId: string;
  let adminCookies: string[];
  let normalCookies: string[];

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

    const adminRegisterRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        tenantName: 'Platform Sirket',
        name: 'Admin',
        email: adminEmail,
        password,
      });
    adminTenantId = adminRegisterRes.body.user.tenantId as string;

    await prisma.user.update({
      where: { id: adminRegisterRes.body.user.id as string },
      data: { isPlatformAdmin: true },
    });

    const adminLoginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: adminEmail, password });
    adminCookies = adminLoginRes.headers['set-cookie'] as unknown as string[];

    const normalRegisterRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        tenantName: 'Normal Sirket',
        name: 'Normal Owner',
        email: normalEmail,
        password,
      });
    normalCookies = normalRegisterRes.headers[
      'set-cookie'
    ] as unknown as string[];
  });

  afterAll(async () => {
    await cleanupTestTenants(prisma, emailSuffix);
    await app.close();
  });

  it('platform-admin olmayan kullanici tenant listesine erisemez (403)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/platform-admin/tenants')
      .set('Cookie', normalCookies);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('platform-admin tenant listesini gorur', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/platform-admin/tenants')
      .set('Cookie', adminCookies);

    expect(res.status).toBe(200);
    const ids = (res.body as { id: string }[]).map((t) => t.id);
    expect(ids).toContain(adminTenantId);
  });

  it('core modulu her tenant icin enabled=true, alwaysOn=true doner', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/platform-admin/tenants/${adminTenantId}/modules`)
      .set('Cookie', adminCookies);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { key: 'core', label: 'Cekirdek', alwaysOn: true, enabled: true },
      { key: 'crm', label: 'Satis (CRM)', alwaysOn: false, enabled: false },
    ]);
  });

  it('alwaysOn modul kapatilmaya calisilirsa MODULE_ALWAYS_ON doner', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/platform-admin/tenants/${adminTenantId}/modules/core`)
      .set('Cookie', adminCookies)
      .send({ enabled: false });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MODULE_ALWAYS_ON');
  });

  it('bilinmeyen modul icin UNKNOWN_MODULE doner', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/platform-admin/tenants/${adminTenantId}/modules/yok`)
      .set('Cookie', adminCookies)
      .send({ enabled: true });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNKNOWN_MODULE');
  });

  it('olmayan tenant icin NOT_FOUND doner', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/platform-admin/tenants/${randomUUID()}/modules`)
      .set('Cookie', adminCookies);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
