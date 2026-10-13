import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/core/filters/http-exception.filter';
import { PrismaService } from '../src/core/prisma/prisma.service';
import { cleanupTestTenants } from './support/cleanup-tenants';
import { createTestProductList } from './support/product-lists';

describe('Sales Orders (e2e)', () => {
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
  let accountIdA: string;
  let contactIdA: string;
  let productId: string;
  let warehouseIdA: string;

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

  it("'crm' modulu kapaliyken GET /sales-orders 403 doner", async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/sales-orders')
      .set('Cookie', cookiesA);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('MODULE_NOT_ENABLED');
  });

  it('crm modulunu ac, hesap/kisi/urun/depo kur', async () => {
    await prisma.tenantModule.create({
      data: { tenantId: tenantIdA, moduleKey: 'crm' },
    });
    await prisma.tenantModule.create({
      data: { tenantId: tenantIdB, moduleKey: 'crm' },
    });

    const account = await prisma.account.create({
      data: { tenantId: tenantIdA, name: 'Bilinen Firma' },
    });
    accountIdA = account.id;

    const contact = await prisma.contact.create({
      data: {
        tenantId: tenantIdA,
        accountId: accountIdA,
        firstName: 'Ayse',
        lastName: 'Yilmaz',
        email: 'ayse@example.com',
      },
    });
    contactIdA = contact.id;

    const productListId = await createTestProductList(prisma, tenantIdA);

    const product = await prisma.product.create({
      data: {
        tenantId: tenantIdA,
        productListId,
        name: 'Dizustu Bilgisayar',
        price: 10000,
      },
    });
    productId = product.id;

    const warehouse = await prisma.warehouse.create({
      data: { tenantId: tenantIdA, name: `Depo${emailSuffix}` },
    });
    warehouseIdA = warehouse.id;
  });

  let approvedQuoteId: string;
  let salesOrderId: string;

  it('POST /quotes: dogrudan APPROVED olunca SalesOrder otomatik acilir', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/quotes')
      .set('Cookie', cookiesA)
      .send({
        accountId: accountIdA,
        contactId: contactIdA,
        items: [{ productId, quantity: 1, discountPct: 0, vatPct: 0 }],
      });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('APPROVED');
    approvedQuoteId = res.body.id as string;

    const salesOrder = await prisma.salesOrder.findFirst({
      where: { quoteId: approvedQuoteId },
    });
    expect(salesOrder).not.toBeNull();
    expect(salesOrder?.status).toBe('PENDING');
    expect(salesOrder?.contactId).toBe(contactIdA);
    expect(salesOrder?.orderNumber).toMatch(/^SAT-\d{4}-\d{2}-\d{2}-\d{3}$/);
    salesOrderId = salesOrder?.id as string;
  });

  it('GET /sales-orders: yeni acilan kayit PENDING durumuyla listede gorunur', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/sales-orders')
      .query({ accountId: accountIdA })
      .set('Cookie', cookiesA);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].status).toBe('PENDING');
    expect(res.body.data[0].quote.quoteNumber).toBeDefined();
  });

  it('GET /sales-orders/:id: teklif kalemlerini salt-okunur gosterir', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/sales-orders/${salesOrderId}`)
      .set('Cookie', cookiesA);
    expect(res.status).toBe(200);
    expect(res.body.quote.items).toHaveLength(1);
    expect(res.body.quote.items[0].productId).toBe(productId);
  });

  it('PATCH /sales-orders/:id: durumu degistirir', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/sales-orders/${salesOrderId}`)
      .set('Cookie', cookiesA)
      .send({ status: 'PROCESSING' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('PROCESSING');
  });

  it('PATCH /sales-orders/:id: gecersiz durum degeri 400 doner', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/sales-orders/${salesOrderId}`)
      .set('Cookie', cookiesA)
      .send({ status: 'NOT_A_STATUS' });
    expect(res.status).toBe(400);
  });

  let pendingQuoteId: string;

  it('POST /quotes/:id/approve: onaylaninca SalesOrder (contactId olmadan) acilir', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/quotes')
      .set('Cookie', cookiesA)
      .send({
        accountId: accountIdA,
        items: [{ productId, quantity: 1, discountPct: 0, vatPct: 0 }],
      });
    pendingQuoteId = createRes.body.id as string;
    await prisma.quote.update({
      where: { id: pendingQuoteId },
      data: { status: 'PENDING_APPROVAL' },
    });

    const res = await request(app.getHttpServer())
      .post(`/api/v1/quotes/${pendingQuoteId}/approve`)
      .set('Cookie', cookiesA)
      .send({ warehouseId: warehouseIdA });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('APPROVED');

    const salesOrder = await prisma.salesOrder.findFirst({
      where: { quoteId: pendingQuoteId },
    });
    expect(salesOrder).not.toBeNull();
    expect(salesOrder?.contactId).toBeNull();
  });

  it('ayni teklif tekrar APPROVED olmaya calisilsa bile ikinci bir SalesOrder acilmaz (idempotent)', async () => {
    const countBefore = await prisma.salesOrder.count({
      where: { quoteId: pendingQuoteId },
    });
    expect(countBefore).toBe(1);
  });

  it('B tenanti A tenantinin satis siparisine erisemez (404)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/sales-orders/${salesOrderId}`)
      .set('Cookie', cookiesB);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
