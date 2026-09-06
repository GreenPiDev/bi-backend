import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/core/filters/http-exception.filter';
import { PrismaService } from '../src/core/prisma/prisma.service';
import { cleanupTestTenants } from './support/cleanup-tenants';

describe('Quotes (e2e)', () => {
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
  let priceListIdA: string;
  let limitedProductId: string;
  let unlistedProductId: string;

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

  it("'crm' modulu kapaliyken POST /quotes 403 doner", async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/quotes')
      .set('Cookie', cookiesA)
      .send({ accountId: randomUUID(), priceListId: randomUUID(), items: [] });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('MODULE_NOT_ENABLED');
  });

  it("tenant A ve B icin 'crm' modulunu etkinlestir, urun/fiyat listesi kur", async () => {
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

    const limitedProduct = await prisma.product.create({
      data: {
        tenantId: tenantIdA,
        name: 'Dizustu Bilgisayar',
        maxDiscountPct: 10,
      },
    });
    limitedProductId = limitedProduct.id;

    const unlistedProduct = await prisma.product.create({
      data: { tenantId: tenantIdA, name: 'Klavye' },
    });
    unlistedProductId = unlistedProduct.id;

    const priceList = await prisma.priceList.create({
      data: {
        tenantId: tenantIdA,
        name: 'Standart Fiyat Listesi',
        items: {
          create: [{ productId: limitedProductId, unitPrice: 20000 }],
        },
      },
    });
    priceListIdA = priceList.id;
  });

  it('POST /quotes: fiyat listesinde olmayan ve manuel fiyati da girilmeyen urun icin 400 PRICE_NOT_FOUND doner', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/quotes')
      .set('Cookie', cookiesA)
      .send({
        accountId: accountIdA,
        priceListId: priceListIdA,
        items: [
          {
            productId: unlistedProductId,
            quantity: 1,
            discountPct: 0,
            vatPct: 0,
          },
        ],
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('PRICE_NOT_FOUND');
  });

  it('POST /quotes: politika icinde iskonto ile Q1 formatinda numara ve dogrudan APPROVED durumuyla olusur', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/quotes')
      .set('Cookie', cookiesA)
      .send({
        accountId: accountIdA,
        priceListId: priceListIdA,
        items: [
          {
            productId: limitedProductId,
            quantity: 2,
            discountPct: 5,
            vatPct: 20,
          },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.quoteNumber).toMatch(/^TEK-\d{4}-\d{2}-\d{2}-\d{3}$/);
    expect(res.body.status).toBe('APPROVED');
    expect(res.body.items[0].unitPrice).toBe('20000');
    expect(res.body.items[0].discountNote).toBe('Iskonto uygulandi: %5');
  });

  it('POST /quotes: manuel birim fiyat fiyat listesindeki degeri ezer', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/quotes')
      .set('Cookie', cookiesA)
      .send({
        accountId: accountIdA,
        priceListId: priceListIdA,
        items: [
          {
            productId: limitedProductId,
            quantity: 1,
            unitPrice: 15000,
            discountPct: 0,
            vatPct: 0,
          },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.items[0].unitPrice).toBe('15000');
  });

  let pendingQuoteId: string;

  it('POST /quotes: azami iskonto asilirsa PENDING_APPROVAL olur (Q7)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/quotes')
      .set('Cookie', cookiesA)
      .send({
        accountId: accountIdA,
        priceListId: priceListIdA,
        items: [
          {
            productId: limitedProductId,
            quantity: 1,
            discountPct: 25,
            vatPct: 0,
          },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('PENDING_APPROVAL');
    pendingQuoteId = res.body.id as string;
  });

  it('PATCH /quotes/:id: onay bekleyen teklif duzenlenebilir', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/quotes/${pendingQuoteId}`)
      .set('Cookie', cookiesA)
      .send({
        items: [
          {
            productId: limitedProductId,
            quantity: 3,
            discountPct: 25,
            vatPct: 0,
          },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.items[0].quantity).toBe('3');
    expect(res.body.status).toBe('PENDING_APPROVAL');
  });

  it('POST /quotes/:id/approve: onay bekleyen teklifi onaylar', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/quotes/${pendingQuoteId}/approve`)
      .set('Cookie', cookiesA);
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('APPROVED');
    expect(res.body.approvedAt).toBeTruthy();
  });

  it('PATCH /quotes/:id: onaylanmis teklif artik duzenlenemez (409)', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/quotes/${pendingQuoteId}`)
      .set('Cookie', cookiesA)
      .send({
        items: [
          {
            productId: limitedProductId,
            quantity: 1,
            discountPct: 0,
            vatPct: 0,
          },
        ],
      });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('QUOTE_NOT_EDITABLE');
  });

  it('POST /quotes/:id/reject: onay bekleyen teklifi reddeder', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/quotes')
      .set('Cookie', cookiesA)
      .send({
        accountId: accountIdA,
        priceListId: priceListIdA,
        items: [
          {
            productId: limitedProductId,
            quantity: 1,
            discountPct: 50,
            vatPct: 0,
          },
        ],
      });
    expect(createRes.body.status).toBe('PENDING_APPROVAL');

    const res = await request(app.getHttpServer())
      .post(`/api/v1/quotes/${createRes.body.id}/reject`)
      .set('Cookie', cookiesA);
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('REJECTED');
  });

  it('POST /exports/quote/:id/pdf: onay bekleyen teklif icin 409 QUOTE_NOT_READY doner (Playwright cagrilmadan once reddedilir)', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/quotes')
      .set('Cookie', cookiesA)
      .send({
        accountId: accountIdA,
        priceListId: priceListIdA,
        items: [
          {
            productId: limitedProductId,
            quantity: 1,
            discountPct: 30,
            vatPct: 0,
          },
        ],
      });
    expect(createRes.body.status).toBe('PENDING_APPROVAL');

    const res = await request(app.getHttpServer())
      .post(`/api/v1/exports/quote/${createRes.body.id}/pdf`)
      .set('Cookie', cookiesA);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('QUOTE_NOT_READY');
  });

  it('POST /quotes/:id/approve: PENDING_APPROVAL disindaki teklif icin 409 doner', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/quotes/${pendingQuoteId}/approve`)
      .set('Cookie', cookiesA);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('QUOTE_NOT_PENDING');
  });

  it('POST /quotes: opportunity alani verilirse firsat otomatik olusur ve Quote.quoteId ile baglanir (O2)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/quotes')
      .set('Cookie', cookiesA)
      .send({
        accountId: accountIdA,
        priceListId: priceListIdA,
        items: [
          {
            productId: limitedProductId,
            quantity: 1,
            discountPct: 0,
            vatPct: 0,
          },
        ],
        opportunity: { name: 'Tekliften dogan firsat', estimatedValue: 20000 },
      });
    expect(res.status).toBe(201);

    const opportunity = await prisma.opportunity.findFirst({
      where: { quoteId: res.body.id as string },
    });
    expect(opportunity?.name).toBe('Tekliften dogan firsat');
  });

  it('GET /quotes: accountId ve status filtreleriyle sayfali liste doner', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/quotes')
      .query({ accountId: accountIdA, status: 'APPROVED' })
      .set('Cookie', cookiesA);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(
      (res.body.data as { status: string }[]).every(
        (q) => q.status === 'APPROVED',
      ),
    ).toBe(true);
  });

  it('B tenanti A tenantinin teklifine erisemez (404)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/quotes/${pendingQuoteId}`)
      .set('Cookie', cookiesB);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('DELETE /quotes/:id: teklifi yumusak siler', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/v1/quotes/${pendingQuoteId}`)
      .set('Cookie', cookiesA);
    expect(res.status).toBe(204);

    const getRes = await request(app.getHttpServer())
      .get(`/api/v1/quotes/${pendingQuoteId}`)
      .set('Cookie', cookiesA);
    expect(getRes.status).toBe(404);
  });
});
