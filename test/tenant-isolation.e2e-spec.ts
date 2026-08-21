import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/core/filters/http-exception.filter';
import { PrismaService } from '../src/core/prisma/prisma.service';

/**
 * CLAUDE.md SS5.6 zorunlu testi: A kiracisinin kullanicisi, B kiracisinin
 * kaynak ID'siyle istek atarsa 404 alir (403 degil -- varligi sizdirma).
 */
describe('Tenant izolasyonu (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const emailSuffix = `-${randomUUID()}@test.com`;
  const tenantAOwnerEmail = `tenant-a-owner${emailSuffix}`;
  const tenantBOwnerEmail = `tenant-b-owner${emailSuffix}`;

  let tenantACookies: string[];
  let tenantBOwnerId: string;

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

    const tenantARes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        tenantName: 'Tenant A Firma',
        name: 'A Owner',
        email: tenantAOwnerEmail,
        password: 'sifre1234',
      });
    tenantACookies = tenantARes.headers['set-cookie'] as unknown as string[];

    const tenantBRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        tenantName: 'Tenant B Firma',
        name: 'B Owner',
        email: tenantBOwnerEmail,
        password: 'sifre1234',
      });
    tenantBOwnerId = tenantBRes.body.user.id;

    expect(tenantARes.body.user.tenantId).not.toBe(
      tenantBRes.body.user.tenantId,
    );
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { endsWith: emailSuffix } },
    });
    await app.close();
  });

  it("A tenant'in kullanicisi, B tenant'in kullanici ID'siyle rol degistirmeye calisirsa 404 alir (403 degil)", async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/users/${tenantBOwnerId}/role`)
      .set('Cookie', tenantACookies)
      .send({ role: 'VIEWER' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it("A tenant'in kullanici listesi B tenant'in kullanicilarini icermez", async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Cookie', tenantACookies);

    expect(res.status).toBe(200);
    const ids = (res.body as { id: string }[]).map((u) => u.id);
    expect(ids).not.toContain(tenantBOwnerId);
  });

  it("B tenant'in kullanicisi hala kendi tenant'inda degismeden durur (yan etki yok)", async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: tenantBOwnerEmail, password: 'sifre1234' });

    expect(loginRes.status).toBe(201);
    expect(loginRes.body.user.role).toBe('OWNER');
  });
});
