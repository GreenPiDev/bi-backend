import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/core/filters/http-exception.filter';
import { PrismaService } from '../src/core/prisma/prisma.service';
import { CrmReportProvisioningService } from '../src/modules/datasets/crm-report-provisioning.service';
import { cleanupTestTenants } from './support/cleanup-tenants';

/**
 * Faz 11f (R1-R2, bkz. docs/VARSAYIMLAR.md V29): sentetik CRM_TABLE dataset'inin
 * sorgu motoru uzerinden dogru calistigini kanitlar. Fixture'lar bilerek dogrudan
 * Prisma ile kuruluyor (Quote is business kurallarinin dogrulanmasi quotes.e2e-spec.ts'in
 * konusu) - burasi sadece raporlama katmanini test ediyor.
 */
describe('CRM Rapor Dataset (e2e, Faz 11f)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let provisioning: CrmReportProvisioningService;

  const emailSuffix = `-${randomUUID()}@test.com`;
  const ownerEmailA = `owner-a${emailSuffix}`;
  const ownerEmailB = `owner-b${emailSuffix}`;
  const password = 'sifre1234';

  let tenantAId: string;
  let ownerAId: string;
  let cookiesA: string[];
  let cookiesB: string[];
  let crmDatasetId: string;

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
    provisioning = app.get(CrmReportProvisioningService);

    const registerA = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        tenantName: 'Tenant A',
        name: 'Owner A',
        email: ownerEmailA,
        password,
      });
    tenantAId = registerA.body.user.tenantId as string;
    ownerAId = registerA.body.user.id as string;
    cookiesA = registerA.headers['set-cookie'] as unknown as string[];

    const registerB = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        tenantName: 'Tenant B',
        name: 'Owner B',
        email: ownerEmailB,
        password,
      });
    cookiesB = registerB.headers['set-cookie'] as unknown as string[];

    // /datasets ucu @ModulePage('datasets') ile 'analytics' modulune bagli (preview/
    // fields testleri icin gerekli) - /query bu kapiya tabi degil.
    await prisma.tenantModule.create({
      data: { tenantId: tenantAId, moduleKey: 'analytics' },
    });

    const account = await prisma.account.create({
      data: { tenantId: tenantAId, name: 'Musteri A' },
    });
    const product = await prisma.product.create({
      data: { tenantId: tenantAId, name: 'Urun A', unit: 'adet' },
    });
    const priceList = await prisma.priceList.create({
      data: {
        tenantId: tenantAId,
        name: 'Liste',
        items: { create: [{ productId: product.id, unitPrice: 100 }] },
      },
    });
    const salesRepB = await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `salesrepb${emailSuffix}`,
        passwordHash: 'x',
        name: 'Satisci B',
      },
    });

    // Onaylanmis: 2 * 100 * (1 - 0/100) * (1 + 20/100) = 240
    await prisma.quote.create({
      data: {
        tenantId: tenantAId,
        accountId: account.id,
        priceListId: priceList.id,
        quoteNumber: 'TEK-TEST-A-001',
        status: 'APPROVED',
        approvedAt: new Date(),
        createdById: ownerAId,
        items: {
          create: [
            {
              productId: product.id,
              quantity: 2,
              unitPrice: 100,
              discountPct: 0,
              vatPct: 20,
            },
          ],
        },
      },
    });
    // Onaylanmis: 1 * 500 * (1 - 10/100) * (1 + 0/100) = 450
    await prisma.quote.create({
      data: {
        tenantId: tenantAId,
        accountId: account.id,
        priceListId: priceList.id,
        quoteNumber: 'TEK-TEST-A-002',
        status: 'APPROVED',
        approvedAt: new Date(),
        createdById: salesRepB.id,
        items: {
          create: [
            {
              productId: product.id,
              quantity: 1,
              unitPrice: 500,
              discountPct: 10,
              vatPct: 0,
            },
          ],
        },
      },
    });
    // Taslak (henuz onaylanmamis): status filtresiyle disarida kalmali.
    await prisma.quote.create({
      data: {
        tenantId: tenantAId,
        accountId: account.id,
        priceListId: priceList.id,
        quoteNumber: 'TEK-TEST-A-003',
        status: 'DRAFT',
        createdById: ownerAId,
        items: {
          create: [
            {
              productId: product.id,
              quantity: 1,
              unitPrice: 1000,
              discountPct: 0,
              vatPct: 0,
            },
          ],
        },
      },
    });

    await provisioning.provisionForTenant(tenantAId);
    const dataset = await prisma.dataset.findFirst({
      where: { tenantId: tenantAId, sourceKind: 'CRM_TABLE' },
    });
    crmDatasetId = dataset!.id;
  }, 30_000);

  afterAll(async () => {
    await cleanupTestTenants(prisma, emailSuffix);
    await app.close();
  });

  it('APPROVED tekliflerin toplam satis tutarini dogru hesaplar (R1) ve number olarak doner', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/query')
      .set('Cookie', cookiesA)
      .send({
        datasetId: crmDatasetId,
        measures: [{ field: 'lineTotal', agg: 'sum', alias: 'toplam' }],
        dimensions: [],
        filters: [{ field: 'status', op: 'eq', value: 'APPROVED' }],
        orderBy: [],
      });

    expect(res.status).toBe(201);
    expect(res.body.rows).toEqual([[690]]);
    // pg numeric->string tuzaginin regresyon testi (bkz. VARSAYIMLAR V29).
    expect(typeof res.body.rows[0][0]).toBe('number');
  });

  it('status filtresi olmadan DRAFT dahil tum tekliflerin toplamini gosterir (view sabit bir durum filtresi icermez)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/query')
      .set('Cookie', cookiesA)
      .send({
        datasetId: crmDatasetId,
        measures: [{ field: 'lineTotal', agg: 'sum', alias: 'toplam' }],
        dimensions: [],
        filters: [],
        orderBy: [],
      });

    expect(res.status).toBe(201);
    expect(res.body.rows).toEqual([[1690]]);
  });

  it('satisciya gore kirilim dogru gruplar (R2)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/query')
      .set('Cookie', cookiesA)
      .send({
        datasetId: crmDatasetId,
        measures: [{ field: 'lineTotal', agg: 'sum', alias: 'toplam' }],
        dimensions: [{ field: 'salesRepName' }],
        filters: [{ field: 'status', op: 'eq', value: 'APPROVED' }],
        orderBy: [{ field: 'salesRepName', dir: 'asc' }],
      });

    expect(res.status).toBe(201);
    const bySalesRep = Object.fromEntries(res.body.rows as [string, number][]);
    expect(bySalesRep['Owner A']).toBe(240);
    expect(bySalesRep['Satisci B']).toBe(450);
  });

  it('B tenanti A tenantinin CRM dataset idsiyle sorgu atarsa 404 alir', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/query')
      .set('Cookie', cookiesB)
      .send({
        datasetId: crmDatasetId,
        measures: [],
        dimensions: [],
        filters: [],
        orderBy: [],
      });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('GET /datasets/:id/preview CRM dataset icin tenanta ait satirlari doner', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/datasets/${crmDatasetId}/preview`)
      .set('Cookie', cookiesA);

    expect(res.status).toBe(201);
    expect(res.body.rows.length).toBeGreaterThan(0);
  });

  it('PATCH /datasets/:id/fields CRM dataset icin ad/tip degistirmeye izin vermez', async () => {
    const datasetRes = await request(app.getHttpServer())
      .get(`/api/v1/datasets/${crmDatasetId}`)
      .set('Cookie', cookiesA);
    const lineTotalField = (
      datasetRes.body.fields as { id: string; name: string }[]
    ).find((f) => f.name === 'lineTotal')!;

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/datasets/${crmDatasetId}/fields`)
      .set('Cookie', cookiesA)
      .send({ fields: [{ id: lineTotalField.id, type: 'STRING' }] });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('CRM_DATASET_READONLY_SCHEMA');
  });

  it('PATCH /datasets/:id/fields CRM dataset icin label degisikligine izin verir', async () => {
    const datasetRes = await request(app.getHttpServer())
      .get(`/api/v1/datasets/${crmDatasetId}`)
      .set('Cookie', cookiesA);
    const lineTotalField = (
      datasetRes.body.fields as { id: string; name: string }[]
    ).find((f) => f.name === 'lineTotal')!;

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/datasets/${crmDatasetId}/fields`)
      .set('Cookie', cookiesA)
      .send({ fields: [{ id: lineTotalField.id, label: 'Ciro' }] });

    expect(res.status).toBe(200);
    const updated = (res.body.fields as { id: string; label: string }[]).find(
      (f) => f.id === lineTotalField.id,
    );
    expect(updated?.label).toBe('Ciro');
  });
});
