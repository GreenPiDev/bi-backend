import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/core/filters/http-exception.filter';
import { PrismaService } from '../src/core/prisma/prisma.service';
import { cleanupTestTenants } from './support/cleanup-tenants';

describe('Imports (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const emailSuffix = `-${randomUUID()}@test.com`;
  const ownerEmailA = `owner-a${emailSuffix}`;
  const password = 'sifre1234';

  let tenantIdA: string;
  let cookiesA: string[];

  const accountsCsv = Buffer.from(
    'Firma Adi,Sehir\nAcme A.S.,Istanbul\n,Ankara\n',
    'utf-8',
  );

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
  }, 30_000);

  afterAll(async () => {
    await cleanupTestTenants(prisma, emailSuffix);
    await app.close();
  });

  it("'crm' modulu kapaliyken POST /imports/preview 403 doner", async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/imports/preview')
      .set('Cookie', cookiesA)
      .attach('file', accountsCsv, 'firmalar.csv');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('MODULE_NOT_ENABLED');
  });

  it("tenant icin 'crm' modulunu etkinlestir", async () => {
    await prisma.tenantModule.create({
      data: { tenantId: tenantIdA, moduleKey: 'crm' },
    });
  });

  it('POST /imports/preview basliklari ve ornek satirlari doner', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/imports/preview')
      .set('Cookie', cookiesA)
      .attach('file', accountsCsv, 'firmalar.csv');
    expect(res.status).toBe(201);
    expect(res.body.headers).toEqual(['Firma Adi', 'Sehir']);
    expect(res.body.totalRows).toBe(2);
  });

  it("POST /imports/accounts 'mapping' alani eksikse 400 doner", async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/imports/accounts')
      .set('Cookie', cookiesA)
      .attach('file', accountsCsv, 'firmalar.csv');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('POST /imports/accounts gecerli satirlari aktarir, hatali satiri raporlar', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/imports/accounts')
      .set('Cookie', cookiesA)
      .field('mapping', JSON.stringify({ name: 'Firma Adi', city: 'Sehir' }))
      .attach('file', accountsCsv, 'firmalar.csv');
    expect(res.status).toBe(201);
    expect(res.body.totalRows).toBe(2);
    expect(res.body.imported).toBe(1);
    expect(res.body.errors).toHaveLength(1);
    expect(res.body.errors[0].row).toBe(3);
  });

  it('GET /imports/accounts/export xlsx dosyasi doner', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/imports/accounts/export')
      .set('Cookie', cookiesA);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
  });
});
