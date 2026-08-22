import { randomUUID } from 'node:crypto';
import * as path from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { RawSqlService } from '../src/core/database/raw-sql.service';
import { HttpExceptionFilter } from '../src/core/filters/http-exception.filter';
import { PrismaService } from '../src/core/prisma/prisma.service';

const FIXTURES_DIR = path.join(__dirname, 'fixtures');

async function waitForReady(
  app: INestApplication,
  cookies: string[],
  dataSourceId: string,
  timeoutMs = 15_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/datasources/${dataSourceId}/status`)
      .set('Cookie', cookies);
    if (res.body.status === 'READY') {
      return res.body.datasetId as string;
    }
    if (res.body.status === 'FAILED') {
      throw new Error(`Ingest failed: ${res.body.errorMessage}`);
    }
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for READY, last=${res.body.status}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}

function widgetPayload(datasetId: string) {
  return {
    type: 'kpi',
    title: 'Toplam Tutar',
    querySpec: {
      datasetId,
      measures: [{ field: 'tutar', agg: 'sum', alias: 'toplam' }],
      dimensions: [],
      filters: [],
      orderBy: [],
    },
    position: { x: 0, y: 0, w: 2, h: 2 },
  };
}

describe('Widgets (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let rawSql: RawSqlService;

  const emailSuffix = `-${randomUUID()}@test.com`;
  const ownerEmailA = `owner-a${emailSuffix}`;
  const ownerEmailB = `owner-b${emailSuffix}`;
  const password = 'sifre1234';

  let tenantAId: string;
  let cookiesA: string[];
  let cookiesB: string[];
  let datasetId: string;
  let dashboardId: string;
  let otherDashboardId: string;
  let widgetId: string;

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
    rawSql = app.get(RawSqlService);

    const registerA = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        tenantName: 'Tenant A',
        name: 'Owner A',
        email: ownerEmailA,
        password,
      });
    tenantAId = registerA.body.user.tenantId as string;
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

    const uploadRes = await request(app.getHttpServer())
      .post('/api/v1/datasources/upload')
      .set('Cookie', cookiesA)
      .field('name', 'Klinik Randevu')
      .attach('file', path.join(FIXTURES_DIR, 'klinik-randevu.csv'));
    datasetId = await waitForReady(app, cookiesA, uploadRes.body.id as string);

    const dashboardRes = await request(app.getHttpServer())
      .post('/api/v1/dashboards')
      .set('Cookie', cookiesA)
      .send({ name: 'Klinik Panosu' });
    dashboardId = dashboardRes.body.id as string;

    const otherDashboardRes = await request(app.getHttpServer())
      .post('/api/v1/dashboards')
      .set('Cookie', cookiesA)
      .send({ name: 'Diger Pano' });
    otherDashboardId = otherDashboardRes.body.id as string;
  }, 30_000);

  afterAll(async () => {
    if (datasetId) {
      await rawSql.dropTable(tenantAId, datasetId).catch(() => undefined);
    }
    await prisma.user.deleteMany({
      where: { email: { endsWith: emailSuffix } },
    });
    await app.close();
  });

  it('POST /dashboards/:id/widgets yeni widget olusturur', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/dashboards/${dashboardId}/widgets`)
      .set('Cookie', cookiesA)
      .send(widgetPayload(datasetId));
    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Toplam Tutar');
    widgetId = res.body.id as string;
  });

  it('gecersiz agg degeri icin 400 doner (Zod semasi reddeder)', async () => {
    const payload = widgetPayload(datasetId);
    payload.querySpec.measures = [
      { field: 'tutar', agg: 'gecersiz_agg' as never, alias: 'x' },
    ];
    const res = await request(app.getHttpServer())
      .post(`/api/v1/dashboards/${dashboardId}/widgets`)
      .set('Cookie', cookiesA)
      .send(payload);
    expect(res.status).toBe(400);
  });

  it('GET /dashboards/:id/widgets widgeti listeler', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/dashboards/${dashboardId}/widgets`)
      .set('Cookie', cookiesA);
    expect(res.status).toBe(200);
    expect((res.body as { id: string }[]).map((w) => w.id)).toContain(widgetId);
  });

  it('PATCH /dashboards/:id/widgets/:widgetId basligi gunceller', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/dashboards/${dashboardId}/widgets/${widgetId}`)
      .set('Cookie', cookiesA)
      .send({ title: 'Guncel Baslik' });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Guncel Baslik');
  });

  it('widget yanlis dashboardId altinda guncellenemez (404)', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/dashboards/${otherDashboardId}/widgets/${widgetId}`)
      .set('Cookie', cookiesA)
      .send({ title: 'ele gecirme' });
    expect(res.status).toBe(404);
  });

  it('B tenanti A tenantinin widgetini guncelleyemez (404)', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/dashboards/${dashboardId}/widgets/${widgetId}`)
      .set('Cookie', cookiesB)
      .send({ title: 'ele gecirme' });
    expect(res.status).toBe(404);
  });

  it('B tenanti A tenantinin panosu altinda widget olusturamaz (404)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/dashboards/${dashboardId}/widgets`)
      .set('Cookie', cookiesB)
      .send(widgetPayload(datasetId));
    expect(res.status).toBe(404);
  });

  it('DELETE /dashboards/:id/widgets/:widgetId widgeti siler', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/v1/dashboards/${dashboardId}/widgets/${widgetId}`)
      .set('Cookie', cookiesA);
    expect(res.status).toBe(204);

    const listRes = await request(app.getHttpServer())
      .get(`/api/v1/dashboards/${dashboardId}/widgets`)
      .set('Cookie', cookiesA);
    expect(listRes.body).toEqual([]);
  });
});
