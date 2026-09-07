import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/core/filters/http-exception.filter';
import { PrismaService } from '../src/core/prisma/prisma.service';
import { cleanupTestTenants } from './support/cleanup-tenants';

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
  let projectId: string;

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

    const product = await prisma.product.create({
      data: { tenantId: tenantIdA, name: 'Sunucu' },
    });
    const priceList = await prisma.priceList.create({
      data: {
        tenantId: tenantIdA,
        name: 'Standart Fiyat Listesi',
        items: { create: [{ productId: product.id, unitPrice: 20000 }] },
      },
    });
    const quoteRes = await request(app.getHttpServer())
      .post('/api/v1/quotes')
      .set('Cookie', cookiesA)
      .send({
        accountId: accountIdA,
        priceListId: priceList.id,
        items: [
          { productId: product.id, quantity: 1, discountPct: 0, vatPct: 0 },
        ],
      });
    expect(quoteRes.status).toBe(201);
    quoteIdA = quoteRes.body.id as string;
  });

  it('POST /projects: baska firmaya ait teklif secilirse 400 QUOTE_ACCOUNT_MISMATCH doner', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/projects')
      .set('Cookie', cookiesA)
      .send({
        accountId: otherAccountIdA,
        quoteId: quoteIdA,
        name: 'Depo genisletme',
        estimatedBudget: 10000,
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('QUOTE_ACCOUNT_MISMATCH');
  });

  it('POST /projects: proje olusturur, PRJ-YYYY-AA-GG-NNN numarasi uretir (P1/P2)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/projects')
      .set('Cookie', cookiesA)
      .send({
        accountId: accountIdA,
        quoteId: quoteIdA,
        name: 'Depo genisletme',
        estimatedBudget: 10000,
      });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Depo genisletme');
    expect(res.body.quoteId).toBe(quoteIdA);
    expect(res.body.projectNumber).toMatch(/^PRJ-\d{4}-\d{2}-\d{2}-\d{3}$/);
    projectId = res.body.id as string;
  });

  it('POST /projects: quoteId olmadan da (opsiyonel, P2) olusturulabilir', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/projects')
      .set('Cookie', cookiesA)
      .send({
        accountId: accountIdA,
        name: 'Ofis tadilati',
        estimatedBudget: 5000,
      });
    expect(res.status).toBe(201);
    expect(res.body.quoteId).toBeNull();
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
