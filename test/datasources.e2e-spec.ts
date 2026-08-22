import { randomUUID } from 'node:crypto';
import * as path from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/core/filters/http-exception.filter';
import { PrismaService } from '../src/core/prisma/prisma.service';
import { RawSqlService } from '../src/core/database/raw-sql.service';
import { cleanupTestTenants } from './support/cleanup-tenants';

const FIXTURES_DIR = path.join(__dirname, 'fixtures');

async function waitForStatus(
  app: INestApplication,
  cookies: string[],
  dataSourceId: string,
  target: 'READY' | 'FAILED',
  timeoutMs = 15_000,
): Promise<{
  status: string;
  errorMessage: string | null;
  datasetId: string | null;
}> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/datasources/${dataSourceId}/status`)
      .set('Cookie', cookies);
    if (res.body.status === target || res.body.status === 'FAILED') {
      return res.body as {
        status: string;
        errorMessage: string | null;
        datasetId: string | null;
      };
    }
    if (Date.now() > deadline) {
      throw new Error(
        `Timed out waiting for status=${target}, last=${res.body.status}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}

describe('Datasources (e2e)', () => {
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
  });

  afterAll(async () => {
    await cleanupTestTenants(prisma, emailSuffix);
    await app.close();
  });

  it('CSV yukler, tip cikarimi yapar ve fiziksel tabloya yazar (READY)', async () => {
    const uploadRes = await request(app.getHttpServer())
      .post('/api/v1/datasources/upload')
      .set('Cookie', cookiesA)
      .field('name', 'Perakende Satis')
      .attach('file', path.join(FIXTURES_DIR, 'perakende-satis.csv'));

    expect(uploadRes.status).toBe(201);
    const dataSourceId = uploadRes.body.id as string;

    const status = await waitForStatus(app, cookiesA, dataSourceId, 'READY');
    expect(status.status).toBe('READY');
    expect(status.datasetId).toBeTruthy();

    const dataset = await prisma.dataset.findFirst({
      where: { id: status.datasetId! },
      include: { fields: { orderBy: { ordinal: 'asc' } } },
    });
    expect(dataset).not.toBeNull();
    expect(dataset!.rowCount).toBe(8);
    expect(dataset!.fields.map((f) => f.name)).toEqual([
      'musteri_adi',
      'sehir',
      'urun',
      'adet',
      'birim_fiyat',
      'toplam_tutar',
      'satis_tarihi',
      'iade_mi',
    ]);
    expect(dataset!.fields.find((f) => f.name === 'toplam_tutar')!.type).toBe(
      'NUMBER',
    );
    expect(dataset!.fields.find((f) => f.name === 'satis_tarihi')!.type).toBe(
      'DATE',
    );
    expect(dataset!.fields.find((f) => f.name === 'iade_mi')!.type).toBe(
      'BOOLEAN',
    );

    const preview = await rawSql.previewRows(tenantAId, dataset!.id, 50);
    expect(preview.rows).toHaveLength(8);
  });

  it('gecersiz dosya tipi reddedilir (UNSUPPORTED_FILE_TYPE)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/datasources/upload')
      .set('Cookie', cookiesA)
      .attach(
        'file',
        Buffer.from('bu bir metin dosyasidir'),
        'not-supported.txt',
      );

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNSUPPORTED_FILE_TYPE');
  });

  it('B tenanti A tenantinin veri kaynagi durumuna erisemez (404)', async () => {
    const uploadRes = await request(app.getHttpServer())
      .post('/api/v1/datasources/upload')
      .set('Cookie', cookiesA)
      .attach('file', path.join(FIXTURES_DIR, 'kargo-lojistik.csv'));

    const dataSourceId = uploadRes.body.id as string;

    const res = await request(app.getHttpServer())
      .get(`/api/v1/datasources/${dataSourceId}/status`)
      .set('Cookie', cookiesB);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');

    // Ingest'in arka planda bitmesini bekle; aksi halde afterAll'daki temizlik
    // hala yazan BullMQ worker'i ile yarisa girip FK ihlaline yol acabilir.
    await waitForStatus(app, cookiesA, dataSourceId, 'READY');
  });
});
