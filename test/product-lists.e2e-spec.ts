import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/core/filters/http-exception.filter';
import { PrismaService } from '../src/core/prisma/prisma.service';
import { cleanupTestTenants } from './support/cleanup-tenants';

describe('ProductLists (e2e)', () => {
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
  let productListId: string;

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

  it("'crm' modulu kapaliyken POST /product-lists 403 doner", async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/product-lists')
      .set('Cookie', cookiesA)
      .send({ name: 'Genel' });
    expect(res.status).toBe(403);
  });

  it("tenant A ve B icin 'crm' modulunu etkinlestir", async () => {
    await prisma.tenantModule.create({
      data: { tenantId: tenantIdA, moduleKey: 'crm' },
    });
    await prisma.tenantModule.create({
      data: { tenantId: tenantIdB, moduleKey: 'crm' },
    });
  });

  it('POST /product-lists: urun listesi olusturur', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/product-lists')
      .set('Cookie', cookiesA)
      .send({ name: '2026 Katalogu', isDefault: true });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('2026 Katalogu');
    expect(res.body.isDefault).toBe(true);
    productListId = res.body.id as string;
  });

  it('GET /product-lists: tenantA sadece kendi listelerini gorur', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/product-lists')
      .set('Cookie', cookiesA);
    expect(res.status).toBe(200);
    expect(
      res.body.data.some((pl: { id: string }) => pl.id === productListId),
    ).toBe(true);
  });

  it('PATCH /product-lists/:id: adi gunceller', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/product-lists/${productListId}`)
      .set('Cookie', cookiesA)
      .send({ name: 'Bayi Katalogu' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Bayi Katalogu');
  });

  it('B tenanti A tenantinin urun listesine erisemez (404)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/product-lists/${productListId}`)
      .set('Cookie', cookiesB);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('DELETE /product-lists/:id: yumusak siler', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/v1/product-lists/${productListId}`)
      .set('Cookie', cookiesA);
    expect(res.status).toBe(204);

    const getRes = await request(app.getHttpServer())
      .get(`/api/v1/product-lists/${productListId}`)
      .set('Cookie', cookiesA);
    expect(getRes.status).toBe(404);
  });
});
