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

describe('Datasets (e2e)', () => {
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

  it('GET /datasets tenant A icin datasetleri listeler', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/datasets')
      .set('Cookie', cookiesA);
    expect(res.status).toBe(200);
    expect((res.body as { id: string }[]).map((d) => d.id)).toContain(
      datasetId,
    );
  });

  it('GET /datasets/:id alanlari (fields) ile birlikte doner', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/datasets/${datasetId}`)
      .set('Cookie', cookiesA);
    expect(res.status).toBe(200);
    expect(res.body.fields.length).toBeGreaterThan(0);
  });

  it('POST /datasets/:id/preview ilk satirlari doner', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/datasets/${datasetId}/preview`)
      .set('Cookie', cookiesA);
    expect(res.status).toBe(201);
    expect(res.body.rows.length).toBeGreaterThan(0);
  });

  it('PATCH /datasets/:id/fields kolon adini ve etiketini gunceller, fiziksel kolon yeniden adlandirilir', async () => {
    const before = await request(app.getHttpServer())
      .get(`/api/v1/datasets/${datasetId}`)
      .set('Cookie', cookiesA);
    const field = before.body.fields[0] as {
      id: string;
      name: string;
    };

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/datasets/${datasetId}/fields`)
      .set('Cookie', cookiesA)
      .send({
        fields: [
          { id: field.id, name: 'yeni_kolon_adi', label: 'Yeni Etiket' },
        ],
      });

    expect(res.status).toBe(200);
    const updated = (
      res.body.fields as { id: string; name: string; label: string }[]
    ).find((f) => f.id === field.id);
    expect(updated?.name).toBe('yeni_kolon_adi');
    expect(updated?.label).toBe('Yeni Etiket');

    const preview = await rawSql.previewRows(tenantAId, datasetId, 5);
    expect(preview.columns).toContain('yeni_kolon_adi');
  });

  it('B tenanti A tenantinin datasetine erisemez (404)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/datasets/${datasetId}`)
      .set('Cookie', cookiesB);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('bilinmeyen alan id ile PATCH FIELD_NOT_FOUND doner', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/datasets/${datasetId}/fields`)
      .set('Cookie', cookiesA)
      .send({ fields: [{ id: randomUUID(), label: 'x' }] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('FIELD_NOT_FOUND');
  });
});
