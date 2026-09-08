import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/core/filters/http-exception.filter';
import { PrismaService } from '../src/core/prisma/prisma.service';
import { cleanupTestTenants } from './support/cleanup-tenants';

describe('Files proxy (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const emailSuffix = `-${randomUUID()}@test.com`;
  const ownerEmailA = `owner-a${emailSuffix}`;
  const ownerEmailB = `owner-b${emailSuffix}`;
  const password = 'sifre1234';

  let tenantIdA: string;
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

    const registerA = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        tenantName: 'Files E2E Tenant A',
        name: 'Owner A',
        email: ownerEmailA,
        password,
      });
    tenantIdA = registerA.body.user.tenantId as string;
    cookiesA = registerA.headers['set-cookie'] as unknown as string[];

    const registerB = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        tenantName: 'Files E2E Tenant B',
        name: 'Owner B',
        email: ownerEmailB,
        password,
      });
    cookiesB = registerB.headers['set-cookie'] as unknown as string[];
  }, 30_000);

  afterAll(async () => {
    await cleanupTestTenants(prisma, emailSuffix);
    await app.close();
  });

  it('kimliksiz istek 401 doner', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/files?key=x');
    expect(res.status).toBe(401);
  });

  it('key belirtilmezse FILE_REQUIRED doner', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/files')
      .set('Cookie', cookiesA);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('FILE_REQUIRED');
  });

  it('PILENS ile baslamayan gecersiz anahtar sablonu icin NOT_FOUND doner', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/files?key=../../etc/passwd')
      .set('Cookie', cookiesA);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('B tenanti, A tenantinin anahtarina (kendi tenantId segmentiyle) NOT_FOUND alir - dosya var/yok bilgisi sizdirilmaz', async () => {
    const key = `PILENS/development/${tenantIdA}/avatars/whatever.png`;
    const res = await request(app.getHttpServer())
      .get(`/api/v1/files?key=${encodeURIComponent(key)}`)
      .set('Cookie', cookiesB);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  // R2 ortam degiskenleri yerelde/CI'da tanimli olmayabilir (bkz. .env.example) - o
  // durumda bu test atlanir; STORAGE_NOT_CONFIGURED davranisi ag'a cikmadan
  // core/storage/r2-storage.service.spec.ts'te ayrica birim test ediliyor.
  it.runIf(Boolean(process.env.R2_ACCOUNT_ID))(
    "gecerli, kendi tenant'ina ait bir anahtar icin gercek dosyayi R2'den proxy'ler",
    async () => {
      const pngBuffer = Buffer.from(
        '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000100e221bc330000000049454e44ae426082',
        'hex',
      );
      const uploadRes = await request(app.getHttpServer())
        .post('/api/v1/users/me/avatar')
        .set('Cookie', cookiesA)
        .attach('file', pngBuffer, {
          filename: 'avatar.png',
          contentType: 'image/png',
        });
      expect(uploadRes.status).toBe(201);
      const avatarUrl = uploadRes.body.avatarUrl as string;
      const relativePath = avatarUrl.replace(/^https?:\/\/[^/]+/, '');

      const fileRes = await request(app.getHttpServer())
        .get(relativePath)
        .set('Cookie', cookiesA);
      expect(fileRes.status).toBe(200);
      expect(fileRes.headers['content-type']).toBe('image/png');

      const crossTenantRes = await request(app.getHttpServer())
        .get(relativePath)
        .set('Cookie', cookiesB);
      expect(crossTenantRes.status).toBe(404);
    },
  );
});
