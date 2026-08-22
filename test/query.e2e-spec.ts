import { randomUUID } from 'node:crypto';
import * as path from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import type { Redis } from 'ioredis';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { RawSqlService } from '../src/core/database/raw-sql.service';
import { HttpExceptionFilter } from '../src/core/filters/http-exception.filter';
import { PrismaService } from '../src/core/prisma/prisma.service';
import { cleanupTestTenants } from './support/cleanup-tenants';
import { REDIS_CLIENT } from '../src/core/redis/redis-client.token';

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

describe('Query (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let rawSql: RawSqlService;
  let redis: Redis;

  const emailSuffix = `-${randomUUID()}@test.com`;
  const ownerEmailA = `owner-a${emailSuffix}`;
  const ownerEmailB = `owner-b${emailSuffix}`;
  const password = 'sifre1234';

  let tenantAId: string;
  let cookiesA: string[];
  let cookiesB: string[];
  let datasetId: string;

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
    redis = app.get(REDIS_CLIENT);

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
  }, 30_000);

  afterAll(async () => {
    if (datasetId) {
      await rawSql.dropTable(tenantAId, datasetId).catch(() => undefined);
    }
    await cleanupTestTenants(prisma, emailSuffix);
    await app.close();
  });

  it('sehire gore toplam tutar gruplar', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/query')
      .set('Cookie', cookiesA)
      .send({
        datasetId,
        measures: [{ field: 'toplam_tutar', agg: 'sum', alias: 'toplam' }],
        dimensions: [{ field: 'sehir' }],
        filters: [],
        orderBy: [{ field: 'sehir', dir: 'asc' }],
      });

    expect(res.status).toBe(201);
    expect(res.body.columns).toEqual([
      { name: 'sehir', type: 'STRING', label: 'Şehir' },
      { name: 'toplam', type: 'NUMBER', label: 'toplam' },
    ]);
    const bySehir = Object.fromEntries(
      (res.body.rows as [string, number][]).map(([sehir, toplam]) => [
        sehir,
        Number(toplam.toFixed(2)),
      ]),
    );
    expect(bySehir).toEqual({
      Ankara: 1597.9,
      Antalya: 1234.5,
      Bursa: 999.95,
      İstanbul: 6068.6,
      İzmir: 3046.9,
    });
    expect(res.body.truncated).toBe(false);
  });

  it('tarih boyutu + granularity ile aylik gruplama ve o boyuta gore siralama calisir', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/query')
      .set('Cookie', cookiesA)
      .send({
        datasetId,
        measures: [{ field: 'toplam_tutar', agg: 'sum', alias: 'toplam' }],
        dimensions: [{ field: 'satis_tarihi', granularity: 'month' }],
        filters: [],
        orderBy: [{ field: 'satis_tarihi', dir: 'asc' }],
      });

    expect(res.status).toBe(201);
    expect(res.body.columns).toEqual([
      { name: 'satis_tarihi', type: 'DATE', label: 'Satış Tarihi' },
      { name: 'toplam', type: 'NUMBER', label: 'toplam' },
    ]);
    expect((res.body.rows as unknown[]).length).toBeGreaterThan(0);
  });

  it('between tarih filtresi dogru satirlari doner', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/query')
      .set('Cookie', cookiesA)
      .send({
        datasetId,
        measures: [{ field: 'toplam_tutar', agg: 'count', alias: 'adet' }],
        dimensions: [],
        filters: [
          {
            field: 'satis_tarihi',
            op: 'between',
            value: ['2026-01-01', '2026-01-11'],
          },
        ],
        orderBy: [],
      });

    expect(res.status).toBe(201);
    expect(res.body.rows).toEqual([[4]]);
  });

  it('count_distinct sehir sayisini doner', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/query')
      .set('Cookie', cookiesA)
      .send({
        datasetId,
        measures: [
          { field: 'sehir', agg: 'count_distinct', alias: 'sehir_sayisi' },
        ],
        dimensions: [],
        filters: [],
        orderBy: [],
      });

    expect(res.status).toBe(201);
    expect(res.body.rows).toEqual([[5]]);
  });

  it('POST /query/rows drill-down ile ham satirlari doner', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/query/rows')
      .set('Cookie', cookiesA)
      .send({
        datasetId,
        measures: [],
        dimensions: [],
        filters: [{ field: 'sehir', op: 'eq', value: 'İstanbul' }],
        orderBy: [{ field: 'musteri_adi', dir: 'asc' }],
      });

    expect(res.status).toBe(201);
    expect(res.body.rows.map((r: unknown[]) => r[0])).toEqual([
      'Ahmet Yılmaz',
      'Zeynep Kaya',
    ]);
  });

  it('B tenanti A tenantinin datasetiyle sorgu atarsa 404 alir', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/query')
      .set('Cookie', cookiesB)
      .send({
        datasetId,
        measures: [],
        dimensions: [],
        filters: [],
        orderBy: [],
      });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('bilinmeyen alan icin UNKNOWN_FIELD doner', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/query')
      .set('Cookie', cookiesA)
      .send({
        datasetId,
        measures: [{ field: 'yok-boyle-bir-alan', agg: 'sum', alias: 'x' }],
        dimensions: [],
        filters: [],
        orderBy: [],
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNKNOWN_FIELD');
  });

  it('sema duzenlemesi sonrasi dataset icin cache anahtarlari silinir', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/query')
      .set('Cookie', cookiesA)
      .send({
        datasetId,
        measures: [{ field: 'adet', agg: 'sum', alias: 'toplam_adet' }],
        dimensions: [],
        filters: [],
        orderBy: [],
      });

    const pattern = `tenant:${tenantAId}:query:${datasetId}:*`;
    const keysBefore = await redis.keys(pattern);
    expect(keysBefore.length).toBeGreaterThan(0);

    const datasetRes = await request(app.getHttpServer())
      .get(`/api/v1/datasets/${datasetId}`)
      .set('Cookie', cookiesA);
    const adetField = (
      datasetRes.body.fields as { id: string; name: string }[]
    ).find((f) => f.name === 'adet')!;

    await request(app.getHttpServer())
      .patch(`/api/v1/datasets/${datasetId}/fields`)
      .set('Cookie', cookiesA)
      .send({ fields: [{ id: adetField.id, label: 'Adet (guncel)' }] });

    const keysAfter = await redis.keys(pattern);
    expect(keysAfter).toEqual([]);
  });
});
