import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/core/filters/http-exception.filter';
import { PrismaService } from '../src/core/prisma/prisma.service';
import { cleanupTestTenants } from './support/cleanup-tenants';

describe('Post-Sale Cases (e2e)', () => {
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
  let otherAccountContactId: string;
  let priceListIdA: string;
  let productId: string;
  let limitedProductId: string;

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

  it("'crm' modulu kapaliyken GET /post-sale-cases 403 doner", async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/post-sale-cases')
      .set('Cookie', cookiesA);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('MODULE_NOT_ENABLED');
  });

  it('crm modulunu ac, hesap/kisi/urun/fiyat listesi kur', async () => {
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

    const otherAccount = await prisma.account.create({
      data: { tenantId: tenantIdA, name: 'Baska Firma' },
    });
    const otherContact = await prisma.contact.create({
      data: {
        tenantId: tenantIdA,
        accountId: otherAccount.id,
        firstName: 'Mehmet',
        lastName: 'Demir',
      },
    });
    otherAccountContactId = otherContact.id;

    const product = await prisma.product.create({
      data: { tenantId: tenantIdA, name: 'Dizustu Bilgisayar' },
    });
    productId = product.id;

    const limitedProduct = await prisma.product.create({
      data: {
        tenantId: tenantIdA,
        name: 'Sunucu',
        maxDiscountPct: 10,
      },
    });
    limitedProductId = limitedProduct.id;

    const priceList = await prisma.priceList.create({
      data: {
        tenantId: tenantIdA,
        name: 'Standart Fiyat Listesi',
        items: {
          create: [
            { productId, unitPrice: 10000 },
            { productId: limitedProductId, unitPrice: 50000 },
          ],
        },
      },
    });
    priceListIdA = priceList.id;
  });

  it('POST /quotes: baska firmaya ait kisi secilirse 400 CONTACT_ACCOUNT_MISMATCH doner', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/quotes')
      .set('Cookie', cookiesA)
      .send({
        accountId: accountIdA,
        contactId: otherAccountContactId,
        priceListId: priceListIdA,
        items: [{ productId, quantity: 1, discountPct: 0, vatPct: 0 }],
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('CONTACT_ACCOUNT_MISMATCH');
  });

  let approvedQuoteId: string;

  it('POST /quotes: kisi secilip dogrudan APPROVED olunca PostSaleCase otomatik acilir (S1)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/quotes')
      .set('Cookie', cookiesA)
      .send({
        accountId: accountIdA,
        contactId: contactIdA,
        priceListId: priceListIdA,
        items: [{ productId, quantity: 1, discountPct: 0, vatPct: 0 }],
      });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('APPROVED');
    approvedQuoteId = res.body.id as string;

    const postSaleCase = await prisma.postSaleCase.findFirst({
      where: { quoteId: approvedQuoteId },
    });
    expect(postSaleCase).not.toBeNull();
    expect(postSaleCase?.contactId).toBe(contactIdA);
  });

  let postSaleCaseId: string;

  it('GET /post-sale-cases: yeni acilan kayit BEKLEMEDE durumuyla listede gorunur', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/post-sale-cases')
      .query({ accountId: accountIdA })
      .set('Cookie', cookiesA);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].status).toBe('BEKLEMEDE');
    postSaleCaseId = res.body.data[0].id as string;
  });

  let pendingQuoteId: string;

  it('POST /quotes: azami iskonto asilinca PENDING_APPROVAL kalir, PostSaleCase henuz acilmaz', async () => {
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
            discountPct: 50,
            vatPct: 0,
          },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('PENDING_APPROVAL');
    pendingQuoteId = res.body.id as string;

    const postSaleCase = await prisma.postSaleCase.findFirst({
      where: { quoteId: pendingQuoteId },
    });
    expect(postSaleCase).toBeNull();
  });

  it('POST /quotes/:id/approve: onaylaninca PostSaleCase (contactId olmadan) acilir', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/quotes/${pendingQuoteId}/approve`)
      .set('Cookie', cookiesA);
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('APPROVED');

    const postSaleCase = await prisma.postSaleCase.findFirst({
      where: { quoteId: pendingQuoteId },
    });
    expect(postSaleCase).not.toBeNull();
    expect(postSaleCase?.contactId).toBeNull();
  });

  it('POST /post-sale-cases/:id/send-survey: contactId zaten varsa resend olarak kabul edilir', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/post-sale-cases/${postSaleCaseId}/send-survey`)
      .set('Cookie', cookiesA)
      .send({});
    expect(res.status).toBe(201);
    expect(res.body.contactId).toBe(contactIdA);
  });

  it('PATCH /post-sale-cases/:id/feedback: geri bildirim isaretlenince durum GERI_BILDIRIM_ALINDI olur', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/post-sale-cases/${postSaleCaseId}/feedback`)
      .set('Cookie', cookiesA)
      .send({ responseNote: 'Musteri memnun' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('GERI_BILDIRIM_ALINDI');
    expect(res.body.feedbackNote).toBe('Musteri memnun');
  });

  it('B tenanti A tenantinin satis sonrasi kaydina erisemez (404)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/post-sale-cases/${postSaleCaseId}`)
      .set('Cookie', cookiesB);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
