import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/core/filters/http-exception.filter';
import { PrismaService } from '../src/core/prisma/prisma.service';
import { cleanupTestTenants } from './support/cleanup-tenants';

describe('GET /page-registry (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const emailSuffix = `-${randomUUID()}@test.com`;
  const adminEmail = `platform-admin${emailSuffix}`;
  const ownerEmail = `owner${emailSuffix}`;
  const password = 'sifre1234';

  let tenantId: string;
  let adminCookies: string[];
  let ownerCookies: string[];

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
    await prisma.user.update({
      where: { id: adminRegisterRes.body.user.id as string },
      data: { isPlatformAdmin: true },
    });
    const adminLoginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: adminEmail, password });
    adminCookies = adminLoginRes.headers['set-cookie'] as unknown as string[];

    const ownerRegisterRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        tenantName: 'Test Sirket',
        name: 'Owner',
        email: ownerEmail,
        password,
      });
    tenantId = ownerRegisterRes.body.user.tenantId as string;
    ownerCookies = ownerRegisterRes.headers[
      'set-cookie'
    ] as unknown as string[];
  });

  afterAll(async () => {
    await cleanupTestTenants(prisma, emailSuffix);
    await app.close();
  });

  it('crm/analytics modulleri kapaliyken bunlara bagli sayfalar listede yer almaz', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/page-registry')
      .set('Cookie', ownerCookies);

    expect(res.status).toBe(200);
    const keys = (res.body as { key: string }[]).map((p) => p.key);
    expect(keys).not.toContain('accounts');
    expect(keys).not.toContain('contacts');
    expect(keys).not.toContain('dashboards');
    expect(keys).not.toContain('datasets');
    expect(keys).toContain('settings');
    expect(keys).toContain('profile');
  });

  it('platform-admin crm modulunu actiginda o tenant icin accounts/contacts listede belirir', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/platform-admin/tenants/${tenantId}/modules/crm`)
      .set('Cookie', adminCookies)
      .send({ enabled: true })
      .expect(200);

    const res = await request(app.getHttpServer())
      .get('/api/v1/page-registry')
      .set('Cookie', ownerCookies);

    expect(res.status).toBe(200);
    const keys = (res.body as { key: string }[]).map((p) => p.key);
    expect(keys).toContain('accounts');
    expect(keys).toContain('contacts');
    expect(keys).not.toContain('dashboards');
    expect(keys).not.toContain('datasets');

    await request(app.getHttpServer())
      .patch(`/api/v1/platform-admin/tenants/${tenantId}/modules/crm`)
      .set('Cookie', adminCookies)
      .send({ enabled: false })
      .expect(200);
  });
});
