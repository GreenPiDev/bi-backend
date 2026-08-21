import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/core/filters/http-exception.filter';
import { PrismaService } from '../src/core/prisma/prisma.service';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `e2e-auth-${randomUUID()}@test.com`;
  let cookies: string[];

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
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it('register: yeni tenant + owner user olusturur, cookie set eder', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        tenantName: 'E2E Firma',
        name: 'E2E User',
        email,
        password: 'sifre1234',
      });

    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('OWNER');
    expect(res.headers['set-cookie']).toBeDefined();
    cookies = res.headers['set-cookie'] as unknown as string[];
  });

  it('me: cookie ile kimlik dogrulanir', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', cookies);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(email);
  });

  it('me: cookie olmadan 401 UNAUTHORIZED doner', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('ayni email ile tekrar register EMAIL_TAKEN doner', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        tenantName: 'Baska Firma',
        name: 'X',
        email,
        password: 'sifre1234',
      });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('yanlis sifre ile login INVALID_CREDENTIALS doner', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'yanlis-sifre' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('dogru sifre ile login basarili olur', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'sifre1234' });
    expect(res.status).toBe(201);
    cookies = res.headers['set-cookie'] as unknown as string[];
  });

  it('refresh: yeni tokenlar uretir', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookies);
    expect(res.status).toBe(201);
    cookies = res.headers['set-cookie'] as unknown as string[];
  });

  it('logout sonrasi me 401 doner', async () => {
    const logoutRes = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Cookie', cookies);
    const clearedCookies = logoutRes.headers[
      'set-cookie'
    ] as unknown as string[];

    const meRes = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', clearedCookies);
    expect(meRes.status).toBe(401);
  });

  it('gecersiz DTO ile register VALIDATION_ERROR doner', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        tenantName: 'a',
        name: '',
        email: 'not-an-email',
        password: '123',
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
