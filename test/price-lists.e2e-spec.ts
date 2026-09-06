import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/core/filters/http-exception.filter';
import { PrismaService } from '../src/core/prisma/prisma.service';
import { cleanupTestTenants } from './support/cleanup-tenants';

describe('PriceLists (e2e)', () => {
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
  let priceListId: string;

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

  it("tenant A ve B icin 'crm' modulunu etkinlestir, urun kur", async () => {
    await prisma.tenantModule.create({
      data: { tenantId: tenantIdA, moduleKey: 'crm' },
    });
    await prisma.tenantModule.create({
      data: { tenantId: tenantIdB, moduleKey: 'crm' },
    });
    const product = await prisma.product.create({
      data: { tenantId: tenantIdA, name: 'Dizustu Bilgisayar' },
    });
    productId = product.id;
  });

  it('POST /price-lists: urun satirlariyla birlikte olusturur', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/price-lists')
      .set('Cookie', cookiesA)
      .send({
        name: 'Standart Fiyat Listesi',
        items: [{ productId, unitPrice: 20000 }],
      });
    expect(res.status).toBe(201);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].unitPrice).toBe('20000');
    expect(res.body.items[0].product.name).toBe('Dizustu Bilgisayar');
    priceListId = res.body.id as string;
  });

  it('POST /price-lists: ayni urun iki kez eklenirse 400 doner', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/price-lists')
      .set('Cookie', cookiesA)
      .send({
        name: 'Gecersiz Liste',
        items: [
          { productId, unitPrice: 1 },
          { productId, unitPrice: 2 },
        ],
      });
    expect(res.status).toBe(400);
  });

  it('PATCH /price-lists/:id: urun satirlarini degistirir', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/price-lists/${priceListId}`)
      .set('Cookie', cookiesA)
      .send({ items: [{ productId, unitPrice: 25000 }] });
    expect(res.status).toBe(200);
    expect(res.body.items[0].unitPrice).toBe('25000');
  });

  it('B tenanti A tenantinin fiyat listesine erisemez (404)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/price-lists/${priceListId}`)
      .set('Cookie', cookiesB);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('DELETE /price-lists/:id: yumusak siler', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/v1/price-lists/${priceListId}`)
      .set('Cookie', cookiesA);
    expect(res.status).toBe(204);

    const getRes = await request(app.getHttpServer())
      .get(`/api/v1/price-lists/${priceListId}`)
      .set('Cookie', cookiesA);
    expect(getRes.status).toBe(404);
  });
});
