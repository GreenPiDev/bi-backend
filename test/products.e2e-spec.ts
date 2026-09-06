import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/core/filters/http-exception.filter';
import { PrismaService } from '../src/core/prisma/prisma.service';
import { cleanupTestTenants } from './support/cleanup-tenants';

describe('Products (e2e)', () => {
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
  let productId: string;

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

  it("'crm' modulu kapaliyken POST /products 403 doner", async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Cookie', cookiesA)
      .send({ name: 'Dizustu Bilgisayar' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('MODULE_NOT_ENABLED');
  });

  it("tenant A ve B icin 'crm' modulunu etkinlestir", async () => {
    await prisma.tenantModule.create({
      data: { tenantId: tenantIdA, moduleKey: 'crm' },
    });
    await prisma.tenantModule.create({
      data: { tenantId: tenantIdB, moduleKey: 'crm' },
    });
  });

  it('POST /products: urun olusturur', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Cookie', cookiesA)
      .send({ name: 'Dizustu Bilgisayar', sku: 'SKU-1', maxDiscountPct: 10 });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Dizustu Bilgisayar');
    expect(res.body.unit).toBe('adet');
    productId = res.body.id as string;
  });

  it('GET /products: sayfali liste doner', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/products')
      .set('Cookie', cookiesA);
    expect(res.status).toBe(200);
    expect((res.body.data as { id: string }[]).map((p) => p.id)).toContain(
      productId,
    );
  });

  it('PATCH /products/:id: gunceller', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/products/${productId}`)
      .set('Cookie', cookiesA)
      .send({ maxDiscountPct: 15 });
    expect(res.status).toBe(200);
    expect(res.body.maxDiscountPct).toBe('15');
  });

  it('B tenanti A tenantinin urunune erisemez (404)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/products/${productId}`)
      .set('Cookie', cookiesB);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('DELETE /products/:id: urunu yumusak siler', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/v1/products/${productId}`)
      .set('Cookie', cookiesA);
    expect(res.status).toBe(204);

    const getRes = await request(app.getHttpServer())
      .get(`/api/v1/products/${productId}`)
      .set('Cookie', cookiesA);
    expect(getRes.status).toBe(404);
  });
});
