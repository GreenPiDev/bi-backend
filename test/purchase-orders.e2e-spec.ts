import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/core/filters/http-exception.filter';
import { PrismaService } from '../src/core/prisma/prisma.service';
import { cleanupTestTenants } from './support/cleanup-tenants';

describe('Purchase Orders & Stock (e2e)', () => {
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
  let productWithStockId: string;
  let productWithoutStockId: string;
  let productLowStockId: string;
  let draftQuoteId: string;
  let approvedQuoteId: string;
  let purchaseOrderId: string;
  let stockItemIdA: string;

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

    const productWithStock = await prisma.product.create({
      data: { tenantId: tenantIdA, name: 'Sunucu' },
    });
    productWithStockId = productWithStock.id;

    const productWithoutStock = await prisma.product.create({
      data: { tenantId: tenantIdA, name: 'Klavye' },
    });
    productWithoutStockId = productWithoutStock.id;

    const productLowStock = await prisma.product.create({
      data: { tenantId: tenantIdA, name: 'Monitor', minStockLevel: 5 },
    });
    productLowStockId = productLowStock.id;

    // productWithStockId icin yeterli stok var (SP2: teklif miktarindan dusulecek)
    await prisma.stockItem.create({
      data: { tenantId: tenantIdA, productId: productWithStockId, quantity: 3 },
    });
    // productLowStockId dusuk stok esiginin altinda (ST1)
    await prisma.stockItem.create({
      data: { tenantId: tenantIdA, productId: productLowStockId, quantity: 2 },
    });

    const priceList = await prisma.priceList.create({
      data: {
        tenantId: tenantIdA,
        name: 'Standart Fiyat Listesi',
        items: {
          create: [
            { productId: productWithStockId, unitPrice: 10000 },
            { productId: productWithoutStockId, unitPrice: 500 },
          ],
        },
      },
    });
    priceListIdA = priceList.id;
  }, 30_000);

  afterAll(async () => {
    await cleanupTestTenants(prisma, emailSuffix);
    await app.close();
  });

  it('DRAFT/PENDING_APPROVAL durumundaki teklifden siparis olusturma 400 QUOTE_NOT_APPROVED doner', async () => {
    // azami iskonto policy tanimli olmadigindan olusturulan teklif dogrudan APPROVED
    // olur - onaysiz durum uretmek icin dogrudan DB'ye DRAFT bir teklif yaziyoruz.
    const quote = await prisma.quote.create({
      data: {
        tenantId: tenantIdA,
        accountId: accountIdA,
        priceListId: priceListIdA,
        quoteNumber: `TEK-TEST-${randomUUID()}`,
        status: 'DRAFT',
        createdById: (
          await prisma.user.findFirstOrThrow({ where: { email: ownerEmailA } })
        ).id,
      },
    });
    draftQuoteId = quote.id;

    const res = await request(app.getHttpServer())
      .post(`/api/v1/quotes/${draftQuoteId}/create-purchase-order`)
      .set('Cookie', cookiesA);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('QUOTE_NOT_APPROVED');
  });

  it('POST /quotes/:id/create-purchase-order: onayli teklifden siparis olusturur, stoktan dusulmus miktarla (SP1/SP2)', async () => {
    const quoteRes = await request(app.getHttpServer())
      .post('/api/v1/quotes')
      .set('Cookie', cookiesA)
      .send({
        accountId: accountIdA,
        priceListId: priceListIdA,
        items: [
          {
            productId: productWithStockId,
            quantity: 10,
            discountPct: 0,
            vatPct: 0,
          },
          {
            productId: productWithoutStockId,
            quantity: 4,
            discountPct: 0,
            vatPct: 0,
          },
        ],
      });
    expect(quoteRes.status).toBe(201);
    expect(quoteRes.body.status).toBe('APPROVED');
    approvedQuoteId = quoteRes.body.id as string;

    const res = await request(app.getHttpServer())
      .post(`/api/v1/quotes/${approvedQuoteId}/create-purchase-order`)
      .set('Cookie', cookiesA);
    expect(res.status).toBe(201);
    expect(res.body.orderNumber).toMatch(/^SIP-\d{4}-\d{2}-\d{2}-\d{3}$/);
    expect(res.body.quoteId).toBe(approvedQuoteId);

    const items = res.body.items as {
      productId: string;
      quantity: string;
      source: string;
    }[];
    const stockedItem = items.find((i) => i.productId === productWithStockId)!;
    const unstockedItem = items.find(
      (i) => i.productId === productWithoutStockId,
    )!;
    // teklif 10 adet, stokta 3 var -> 7 adet siparis edilmeli
    expect(stockedItem.quantity).toBe('7');
    expect(stockedItem.source).toBe('QUOTE');
    // stok hic yok -> teklif miktarinin tamami
    expect(unstockedItem.quantity).toBe('4');
    purchaseOrderId = res.body.id as string;
  });

  it('ayni teklife tekrar siparis olusturulabilir (kisitlanmadi, ikinci SIP numarasi uretir)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/quotes/${approvedQuoteId}/create-purchase-order`)
      .set('Cookie', cookiesA);
    expect(res.status).toBe(201);
    expect(res.body.id).not.toBe(purchaseOrderId);
  });

  it('GET /purchase-orders: sayfali liste doner, quoteId ile filtrelenebilir', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/purchase-orders')
      .query({ quoteId: approvedQuoteId })
      .set('Cookie', cookiesA);
    expect(res.status).toBe(200);
    expect((res.body.data as { id: string }[]).map((p) => p.id)).toContain(
      purchaseOrderId,
    );
  });

  it('PATCH /purchase-orders/:id: ek kalem eklenebilir (SP3) ve durum guncellenebilir', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/purchase-orders/${purchaseOrderId}`)
      .set('Cookie', cookiesA)
      .send({
        status: 'CONFIRMED',
        items: [
          {
            productId: productWithStockId,
            description: 'Sunucu',
            quantity: 7,
            source: 'QUOTE',
          },
          {
            description: 'Nakliye kutusu (teklifte yok)',
            quantity: 2,
            source: 'EXTRA',
          },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CONFIRMED');
    const items = res.body.items as { source: string; description: string }[];
    expect(items.some((i) => i.source === 'EXTRA')).toBe(true);
  });

  it('B tenanti A tenantinin siparisine erisemez (404)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/purchase-orders/${purchaseOrderId}`)
      .set('Cookie', cookiesB);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('DELETE /purchase-orders/:id: siparisi yumusak siler', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/v1/purchase-orders/${purchaseOrderId}`)
      .set('Cookie', cookiesA);
    expect(res.status).toBe(204);

    const getRes = await request(app.getHttpServer())
      .get(`/api/v1/purchase-orders/${purchaseOrderId}`)
      .set('Cookie', cookiesA);
    expect(getRes.status).toBe(404);
  });

  it('GET /stock-items/low-stock: sadece minStockLevel esigine esit/altindaki urunleri doner (ST1)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/stock-items/low-stock')
      .set('Cookie', cookiesA);
    expect(res.status).toBe(200);
    const productIds = (res.body as { productId: string }[]).map(
      (i) => i.productId,
    );
    expect(productIds).toContain(productLowStockId);
    // productWithStockId (minStockLevel tanimsiz) dahil edilmemeli
    expect(productIds).not.toContain(productWithStockId);
  });

  it('PATCH /stock-items/:productId: stok miktarini setler (create-then-update)', async () => {
    const createRes = await request(app.getHttpServer())
      .patch(`/api/v1/stock-items/${productWithoutStockId}`)
      .set('Cookie', cookiesA)
      .send({ quantity: 25 });
    expect(createRes.status).toBe(200);
    expect(createRes.body.quantity).toBe('25');
    stockItemIdA = createRes.body.id as string;

    const updateRes = await request(app.getHttpServer())
      .patch(`/api/v1/stock-items/${productWithoutStockId}`)
      .set('Cookie', cookiesA)
      .send({ quantity: 30 });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.id).toBe(stockItemIdA);
    expect(updateRes.body.quantity).toBe('30');
  });

  it('PATCH /stock-items/:productId: bilinmeyen urun icin 404 doner', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/stock-items/${randomUUID()}`)
      .set('Cookie', cookiesA)
      .send({ quantity: 5 });
    expect(res.status).toBe(404);
  });

  it('B tenanti A tenantinin urunu icin stok gorunumune erisemez (404, cross-tenant product)', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/stock-items/${productWithoutStockId}`)
      .set('Cookie', cookiesB)
      .send({ quantity: 5 });
    expect(res.status).toBe(404);
  });

  it("'crm' modulu kapaliyken siparis ucu 403 doner", async () => {
    await prisma.tenantModule.update({
      where: { tenantId_moduleKey: { tenantId: tenantIdA, moduleKey: 'crm' } },
      data: { disabledAt: new Date() },
    });
    const res = await request(app.getHttpServer())
      .get('/api/v1/purchase-orders')
      .set('Cookie', cookiesA);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('MODULE_NOT_ENABLED');

    await prisma.tenantModule.update({
      where: { tenantId_moduleKey: { tenantId: tenantIdA, moduleKey: 'crm' } },
      data: { disabledAt: null },
    });
  });
});
