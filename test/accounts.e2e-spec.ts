import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/core/filters/http-exception.filter';
import { PrismaService } from '../src/core/prisma/prisma.service';
import { cleanupTestTenants } from './support/cleanup-tenants';
import {
  createTestRole,
  inviteAndAcceptWithRoles,
  inviteUserWithNoPermissions,
} from './support/roles';

describe('Accounts (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const emailSuffix = `-${randomUUID()}@test.com`;
  const ownerEmailA = `owner-a${emailSuffix}`;
  const ownerEmailB = `owner-b${emailSuffix}`;
  const password = 'sifre1234';

  let tenantIdA: string;
  let tenantIdB: string;
  let cookiesA: string[];
  let cookiesB: string[];
  let accountId: string;

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

    const registerA = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        tenantName: 'Tenant A',
        name: 'Owner A',
        email: ownerEmailA,
        password,
      });
    tenantIdA = registerA.body.user.tenantId as string;
    cookiesA = registerA.headers['set-cookie'] as unknown as string[];

    const registerB = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        tenantName: 'Tenant B',
        name: 'Owner B',
        email: ownerEmailB,
        password,
      });
    tenantIdB = registerB.body.user.tenantId as string;
    cookiesB = registerB.headers['set-cookie'] as unknown as string[];
  }, 30_000);

  afterAll(async () => {
    await cleanupTestTenants(prisma, emailSuffix);
    await app.close();
  });

  it("'crm' modulu kapaliyken POST /accounts 403 doner", async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .set('Cookie', cookiesA)
      .send({ name: 'Acme A.S.' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('MODULE_NOT_ENABLED');
  });

  it("tenant icin 'crm' modulunu etkinlestir", async () => {
    await prisma.tenantModule.create({
      data: { tenantId: tenantIdA, moduleKey: 'crm' },
    });
  });

  it('POST /accounts yeni firma olusturur', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .set('Cookie', cookiesA)
      .send({ name: 'Acme A.S.', taxNumber: '', website: '' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Acme A.S.');
    accountId = res.body.id as string;
  });

  it('POST /accounts gecersiz vergi no ile 400 doner', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .set('Cookie', cookiesA)
      .send({ name: 'Yanlis A.S.', taxNumber: '12345' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('GET /accounts sayfali liste doner', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/accounts?page=1&pageSize=25')
      .set('Cookie', cookiesA);
    expect(res.status).toBe(200);
    expect(res.body.meta.page).toBe(1);
    expect((res.body.data as { id: string }[]).map((a) => a.id)).toContain(
      accountId,
    );
  });

  it('GET /accounts/:id firmayi kisileriyle doner', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/accounts/${accountId}`)
      .set('Cookie', cookiesA);
    expect(res.status).toBe(200);
    expect(res.body.contacts).toEqual([]);
  });

  it('PATCH /accounts/:id firmayi gunceller', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/accounts/${accountId}`)
      .set('Cookie', cookiesA)
      .send({ city: 'Istanbul' });
    expect(res.status).toBe(200);
    expect(res.body.city).toBe('Istanbul');
  });

  it('izinsiz kullanici firma olusturamaz (403)', async () => {
    const viewerCookies = await inviteUserWithNoPermissions(
      app,
      cookiesA,
      `viewer${emailSuffix}`,
      password,
    );

    const res = await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .set('Cookie', viewerCookies)
      .send({ name: 'Viewer Firmasi' });
    expect(res.status).toBe(403);
  });

  it('sadece CREATE/UPDATE izni olan kullanici firma olusturabilir ama silemez', async () => {
    const salesRoleId = await createTestRole(app, cookiesA, 'Satis', [
      { pageKey: 'accounts', actions: ['VIEW', 'CREATE', 'UPDATE'] },
    ]);
    const salesCookies = await inviteAndAcceptWithRoles(
      app,
      cookiesA,
      `sales${emailSuffix}`,
      password,
      [salesRoleId],
    );

    const createRes = await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .set('Cookie', salesCookies)
      .send({ name: 'Sales Firmasi' });
    expect(createRes.status).toBe(201);

    const deleteRes = await request(app.getHttpServer())
      .delete(`/api/v1/accounts/${createRes.body.id as string}`)
      .set('Cookie', salesCookies);
    expect(deleteRes.status).toBe(403);
  });

  it("B tenantinda 'crm' modulu kapali oldugu icin liste 403 doner", async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/accounts')
      .set('Cookie', cookiesB);
    expect(res.status).toBe(403);
  });

  it('B tenanti A tenantinin firmasina erisemez (404)', async () => {
    await prisma.tenantModule.create({
      data: { tenantId: tenantIdB, moduleKey: 'crm' },
    });
    const res = await request(app.getHttpServer())
      .get(`/api/v1/accounts/${accountId}`)
      .set('Cookie', cookiesB);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('DELETE /accounts/:id firmayi yumusak siler', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/v1/accounts/${accountId}`)
      .set('Cookie', cookiesA);
    expect(res.status).toBe(204);

    const getRes = await request(app.getHttpServer())
      .get(`/api/v1/accounts/${accountId}`)
      .set('Cookie', cookiesA);
    expect(getRes.status).toBe(404);
  });
});
