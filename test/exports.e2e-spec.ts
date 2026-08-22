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
import { cleanupTestTenants } from './support/cleanup-tenants';

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

describe('Exports (e2e)', () => {
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
      .field('name', 'Perakende Satis')
      .attach('file', path.join(FIXTURES_DIR, 'perakende-satis.csv'));
    datasetId = await waitForReady(app, cookiesA, uploadRes.body.id as string);

    const dashboardRes = await request(app.getHttpServer())
      .post('/api/v1/dashboards')
      .set('Cookie', cookiesA)
      .send({ name: 'Satis Panosu' });
    dashboardId = dashboardRes.body.id as string;

    const widgetRes = await request(app.getHttpServer())
      .post(`/api/v1/dashboards/${dashboardId}/widgets`)
      .set('Cookie', cookiesA)
      .send({
        type: 'bar',
        title: 'Sehir Bazli Toplam',
        querySpec: {
          datasetId,
          measures: [{ field: 'toplam_tutar', agg: 'sum', alias: 'toplam' }],
          dimensions: [{ field: 'sehir' }],
          filters: [],
          orderBy: [],
        },
        position: { x: 0, y: 0, w: 4, h: 3 },
      });
    widgetId = widgetRes.body.id as string;
  }, 30_000);

  afterAll(async () => {
    if (datasetId) {
      await rawSql.dropTable(tenantAId, datasetId).catch(() => undefined);
    }
    await cleanupTestTenants(prisma, emailSuffix);
    await app.close();
  });

  it('POST /exports/widget/:id?format=csv widget sorgusunu CSV olarak doner', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/exports/widget/${widgetId}?format=csv`)
      .set('Cookie', cookiesA);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain(
      `widget-${widgetId}.csv`,
    );
    expect(res.text).toContain('Şehir');
    expect(res.text).toContain('İstanbul');
  });

  it('POST /exports/widget/:id desteklenmeyen format icin 400 doner', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/exports/widget/${widgetId}?format=png`)
      .set('Cookie', cookiesA);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNSUPPORTED_FORMAT');
  });

  it('B tenanti A tenantinin widget CSV export ucuna erisemez (404)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/exports/widget/${widgetId}?format=csv`)
      .set('Cookie', cookiesB);
    expect(res.status).toBe(404);
  });
});
