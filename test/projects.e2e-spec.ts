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

describe('Projects (e2e)', () => {
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
  let otherAccountIdA: string;
  let quoteIdA: string;
  let quoteIdA2: string;
  let projectId: string;
  let otherProjectId: string;

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

  it("'crm' modulu kapaliyken POST /projects 403 doner", async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/projects')
      .set('Cookie', cookiesA)
      .send({
        accountId: randomUUID(),
        name: 'Deneme projesi',
        estimatedBudget: 1000,
      });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('MODULE_NOT_ENABLED');
  });

  it("tenant A ve B icin 'crm' modulunu etkinlestir ve fixture olustur", async () => {
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
    const otherAccount = await prisma.account.create({
      data: { tenantId: tenantIdA, name: 'Baska Firma' },
    });
    otherAccountIdA = otherAccount.id;

    const productListId = await createTestProductList(prisma, tenantIdA);
    const product = await prisma.product.create({
      data: {
        tenantId: tenantIdA,
        productListId,
        name: 'Sunucu',
        price: 20000,
      },
    });
    const quoteRes = await request(app.getHttpServer())
      .post('/api/v1/quotes')
      .set('Cookie', cookiesA)
      .send({
        accountId: accountIdA,
        items: [
          { productId: product.id, quantity: 1, discountPct: 0, vatPct: 0 },
        ],
      });
    expect(quoteRes.status).toBe(201);
    quoteIdA = quoteRes.body.id as string;

    const quoteRes2 = await request(app.getHttpServer())
      .post('/api/v1/quotes')
      .set('Cookie', cookiesA)
      .send({
        accountId: accountIdA,
        items: [
          { productId: product.id, quantity: 2, discountPct: 0, vatPct: 0 },
        ],
      });
    expect(quoteRes2.status).toBe(201);
    quoteIdA2 = quoteRes2.body.id as string;
  });

  it('POST /projects: proje olusturur, PRJ-YYYY-AA-GG-NNN numarasi uretir, teklif olmadan (P1/P2)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/projects')
      .set('Cookie', cookiesA)
      .send({
        accountId: accountIdA,
        name: 'Depo genisletme',
        estimatedBudget: 10000,
      });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Depo genisletme');
    expect(res.body.quotes).toEqual([]);
    expect(res.body.projectNumber).toMatch(/^PRJ-\d{4}-\d{2}-\d{2}-\d{3}$/);
    projectId = res.body.id as string;
  });

  it('PATCH /projects/:id: baska firmaya ait teklif quoteIds icinde verilirse 400 QUOTE_ACCOUNT_MISMATCH doner', async () => {
    const otherQuoteRes = await request(app.getHttpServer())
      .post('/api/v1/quotes')
      .set('Cookie', cookiesA)
      .send({ accountId: otherAccountIdA, items: [] });
    expect(otherQuoteRes.status).toBe(201);

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/projects/${projectId}`)
      .set('Cookie', cookiesA)
      .send({ quoteIds: [otherQuoteRes.body.id] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('QUOTE_ACCOUNT_MISMATCH');
  });

  it('PATCH /projects/:id: quoteIds ile teklifi projeye baglar', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/projects/${projectId}`)
      .set('Cookie', cookiesA)
      .send({ quoteIds: [quoteIdA] });
    expect(res.status).toBe(200);
    expect((res.body.quotes as { id: string }[]).map((q) => q.id)).toEqual([
      quoteIdA,
    ]);
  });

  it('PATCH /projects/:id: baska bir projeye zaten bagli teklif verilirse 400 QUOTE_ALREADY_LINKED_TO_PROJECT doner', async () => {
    const otherProjectRes = await request(app.getHttpServer())
      .post('/api/v1/projects')
      .set('Cookie', cookiesA)
      .send({
        accountId: accountIdA,
        name: 'Baska proje',
        estimatedBudget: 1000,
      });
    expect(otherProjectRes.status).toBe(201);
    otherProjectId = otherProjectRes.body.id as string;

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/projects/${otherProjectId}`)
      .set('Cookie', cookiesA)
      .send({ quoteIds: [quoteIdA] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('QUOTE_ALREADY_LINKED_TO_PROJECT');
  });

  it('PATCH /projects/:id: quoteIds tam degisim (replace) yapar, bos dizi tum iliskileri kaldirir', async () => {
    const replaceRes = await request(app.getHttpServer())
      .patch(`/api/v1/projects/${projectId}`)
      .set('Cookie', cookiesA)
      .send({ quoteIds: [quoteIdA2] });
    expect(replaceRes.status).toBe(200);
    expect(
      (replaceRes.body.quotes as { id: string }[]).map((q) => q.id),
    ).toEqual([quoteIdA2]);

    const clearRes = await request(app.getHttpServer())
      .patch(`/api/v1/projects/${projectId}`)
      .set('Cookie', cookiesA)
      .send({ quoteIds: [] });
    expect(clearRes.status).toBe(200);
    expect(clearRes.body.quotes).toEqual([]);

    // quoteIdA hala serbest (ilk baglandigi projeden bu adimda cikarilmadi,
    // yalnizca projectId'nin kendi iliskisi degisti) - sonraki testler icin
    // tekrar bu projeye baglayalim.
    const relinkRes = await request(app.getHttpServer())
      .patch(`/api/v1/projects/${projectId}`)
      .set('Cookie', cookiesA)
      .send({ quoteIds: [quoteIdA] });
    expect(relinkRes.status).toBe(200);
  });

  it('GET /projects: sayfali liste doner, accountId ile filtrelenebilir', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/projects')
      .query({ accountId: accountIdA })
      .set('Cookie', cookiesA);
    expect(res.status).toBe(200);
    expect((res.body.data as { id: string }[]).map((p) => p.id)).toContain(
      projectId,
    );
  });

  it('PATCH /projects/:id: tahmini butce ve gerceklesen maliyeti gunceller (P3)', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/projects/${projectId}`)
      .set('Cookie', cookiesA)
      .send({ estimatedBudget: 12000, actualCost: 8000 });
    expect(res.status).toBe(200);
    expect(res.body.estimatedBudget).toBe('12000');
    expect(res.body.actualCost).toBe('8000');
  });

  it('B tenanti A tenantinin projesine erisemez (404)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/projects/${projectId}`)
      .set('Cookie', cookiesB);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('DELETE /projects/:id: projeyi yumusak siler', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/v1/projects/${projectId}`)
      .set('Cookie', cookiesA);
    expect(res.status).toBe(204);

    const getRes = await request(app.getHttpServer())
      .get(`/api/v1/projects/${projectId}`)
      .set('Cookie', cookiesA);
    expect(getRes.status).toBe(404);
  });
});
