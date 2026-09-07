import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/core/filters/http-exception.filter';
import { PrismaService } from '../src/core/prisma/prisma.service';
import { cleanupTestTenants } from './support/cleanup-tenants';

describe('Products (e2e)', () => {
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
  let productId: string;

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

  it("'crm' modulu kapaliyken POST /products 403 doner", async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Cookie', cookiesA)
      .send({ name: 'Dizustu Bilgisayar' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('MODULE_NOT_ENABLED');
  });

  it("tenant A ve B icin 'crm' modulunu etkinlestir", async () => {
    await prisma.tenantModule.create({
      data: { tenantId: tenantIdA, moduleKey: 'crm' },
    });
    await prisma.tenantModule.create({
      data: { tenantId: tenantIdB, moduleKey: 'crm' },
    });
  });

  it('POST /products: urun olusturur (aciklama/kategori/maliyet dahil)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Cookie', cookiesA)
      .send({
        name: 'Dizustu Bilgisayar',
        sku: 'SKU-1',
        maxDiscountPct: 10,
        description: 'Ofis kullanimi icin dizustu bilgisayar.',
        category: 'Elektronik',
        costPrice: 12500.5,
      });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Dizustu Bilgisayar');
    expect(res.body.unit).toBe('adet');
    expect(res.body.description).toBe(
      'Ofis kullanimi icin dizustu bilgisayar.',
    );
    expect(res.body.category).toBe('Elektronik');
    expect(res.body.costPrice).toBe('12500.5');
    expect(res.body.imageUrl).toBeNull();
    productId = res.body.id as string;
  });

  it('GET /products: sayfali liste doner', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/products')
      .set('Cookie', cookiesA);
    expect(res.status).toBe(200);
    expect((res.body.data as { id: string }[]).map((p) => p.id)).toContain(
      productId,
    );
  });

  it('PATCH /products/:id: gunceller', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/products/${productId}`)
      .set('Cookie', cookiesA)
      .send({ maxDiscountPct: 15 });
    expect(res.status).toBe(200);
    expect(res.body.maxDiscountPct).toBe('15');
  });

  // R2 ortam degiskenleri yerelde/CI'da tanimli olmayabilir (bkz. .env.example) - o
  // durumda bu test atlanir, konfigurasyon-yoksa-STORAGE_NOT_CONFIGURED davranisi
  // core/storage/r2-storage.service.spec.ts'te ag'a cikmadan test ediliyor.
  it.runIf(Boolean(process.env.R2_ACCOUNT_ID))(
    'POST /products/:id/image + DELETE: gercek R2 bucket ina yukler, herkese acik URL doner, kaldirir',
    async () => {
      // gecerli bir 1x1 PNG (magic-byte dogrulamasini gecmesi icin)
      const pngBuffer = Buffer.from(
        '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000100e221bc330000000049454e44ae426082',
        'hex',
      );
      const uploadRes = await request(app.getHttpServer())
        .post(`/api/v1/products/${productId}/image`)
        .set('Cookie', cookiesA)
        .attach('file', pngBuffer, {
          filename: 'urun.png',
          contentType: 'image/png',
        });
      expect(uploadRes.status).toBe(201);
      expect(uploadRes.body.imageUrl).toContain(`product-images/${productId}/`);

      const deleteRes = await request(app.getHttpServer())
        .delete(`/api/v1/products/${productId}/image`)
        .set('Cookie', cookiesA);
      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.imageUrl).toBeNull();
    },
  );

  it('POST /products/:id/image: gecersiz magic-byte icin UNSUPPORTED_IMAGE_TYPE doner', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/products/${productId}/image`)
      .set('Cookie', cookiesA)
      .attach('file', Buffer.from('not-a-real-image'), {
        filename: 'urun.png',
        contentType: 'image/png',
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNSUPPORTED_IMAGE_TYPE');
  });

  it('POST /products/:id/image: B tenanti A tenantinin urunune erisemez (404)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/products/${productId}/image`)
      .set('Cookie', cookiesB)
      .attach('file', Buffer.from('fake-png-bytes'), {
        filename: 'urun.png',
        contentType: 'image/png',
      });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('B tenanti A tenantinin urunune erisemez (404)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/products/${productId}`)
      .set('Cookie', cookiesB);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('DELETE /products/:id: urunu yumusak siler', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/v1/products/${productId}`)
      .set('Cookie', cookiesA);
    expect(res.status).toBe(204);

    const getRes = await request(app.getHttpServer())
      .get(`/api/v1/products/${productId}`)
      .set('Cookie', cookiesA);
    expect(getRes.status).toBe(404);
  });
});
