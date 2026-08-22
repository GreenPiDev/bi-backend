import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/core/filters/http-exception.filter';
import { PrismaService } from '../src/core/prisma/prisma.service';
import { cleanupTestTenants } from './support/cleanup-tenants';

describe('Users & Invitations (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const testRunId = randomUUID();
  const emailSuffix = `-${testRunId}@test.com`;
  const ownerEmail = `e2e-owner${emailSuffix}`;
  const viewerEmail = `e2e-viewer${emailSuffix}`;
  let ownerCookies: string[];
  let viewerCookies: string[];
  let ownerId: string;
  let viewerId: string;

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
    await cleanupTestTenants(prisma, emailSuffix);
    await app.close();
  });

  it('OWNER kaydolur', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        tenantName: 'Users E2E Firma',
        name: 'Owner',
        email: ownerEmail,
        password: 'sifre1234',
      });
    expect(res.status).toBe(201);
    ownerCookies = res.headers['set-cookie'] as unknown as string[];
    ownerId = res.body.user.id;
  });

  it('kimliksiz users listesi 401 doner', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/users');
    expect(res.status).toBe(401);
  });

  it('OWNER, VIEWER davet eder', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/users/invite')
      .set('Cookie', ownerCookies)
      .send({ email: viewerEmail, role: 'VIEWER' });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();

    const invitationToken = res.body.token as string;

    const infoRes = await request(app.getHttpServer()).get(
      `/api/v1/invitations/${invitationToken}`,
    );
    expect(infoRes.status).toBe(200);
    expect(infoRes.body).toMatchObject({
      email: viewerEmail,
      role: 'VIEWER',
      expired: false,
    });

    const acceptRes = await request(app.getHttpServer())
      .post(`/api/v1/invitations/${invitationToken}/accept`)
      .send({ name: 'Viewer Kisi', password: 'sifre1234' });
    expect(acceptRes.status).toBe(201);
    expect(acceptRes.body.user.role).toBe('VIEWER');
    viewerCookies = acceptRes.headers['set-cookie'] as unknown as string[];
    viewerId = acceptRes.body.user.id;
  });

  it('ayni davet tekrar kabul edilemez (INVITATION_ALREADY_ACCEPTED)', async () => {
    const invite = await request(app.getHttpServer())
      .post('/api/v1/users/invite')
      .set('Cookie', ownerCookies)
      .send({ email: `retry${emailSuffix}`, role: 'VIEWER' });
    const token = invite.body.token as string;

    await request(app.getHttpServer())
      .post(`/api/v1/invitations/${token}/accept`)
      .send({ name: 'X', password: 'sifre1234' });

    const secondAttempt = await request(app.getHttpServer())
      .post(`/api/v1/invitations/${token}/accept`)
      .send({ name: 'Y', password: 'sifre1234' });
    expect(secondAttempt.status).toBe(409);
    expect(secondAttempt.body.error.code).toBe('INVITATION_ALREADY_ACCEPTED');
  });

  it('halihazirda kullanicisi olan email davet edilemez (EMAIL_TAKEN)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/users/invite')
      .set('Cookie', ownerCookies)
      .send({ email: ownerEmail, role: 'VIEWER' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('VIEWER kendi rolunu degistiremez, 403 FORBIDDEN doner', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/users/${viewerId}/role`)
      .set('Cookie', viewerCookies)
      .send({ role: 'ADMIN' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('OWNER, VIEWER rolunu EDITOR yapabilir', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/users/${viewerId}/role`)
      .set('Cookie', ownerCookies)
      .send({ role: 'EDITOR' });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('EDITOR');
  });

  it('OWNER kendi rolunu degistiremez (CANNOT_CHANGE_OWN_ROLE)', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/users/${ownerId}/role`)
      .set('Cookie', ownerCookies)
      .send({ role: 'ADMIN' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('CANNOT_CHANGE_OWN_ROLE');
  });

  it('OWNER baska bir kullaniciyi OWNER yapabilir ve geri alabilir', async () => {
    const promoteRes = await request(app.getHttpServer())
      .patch(`/api/v1/users/${viewerId}/role`)
      .set('Cookie', ownerCookies)
      .send({ role: 'OWNER' });
    expect(promoteRes.status).toBe(200);
    expect(promoteRes.body.role).toBe('OWNER');

    const demoteRes = await request(app.getHttpServer())
      .patch(`/api/v1/users/${viewerId}/role`)
      .set('Cookie', ownerCookies)
      .send({ role: 'EDITOR' });
    expect(demoteRes.status).toBe(200);
    expect(demoteRes.body.role).toBe('EDITOR');
  });

  it('users listesi tum tenant kullanicilarini doner', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Cookie', ownerCookies);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
    expect(res.body.every((u: { tenantId: string }) => u.tenantId)).toBe(true);
  });

  it('gecersiz davet tokeni NOT_FOUND doner', async () => {
    const res = await request(app.getHttpServer()).get(
      '/api/v1/invitations/olmayan-token',
    );
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('INVITATION_NOT_FOUND');
  });

  it('ADMIN, ADMIN rolunde davet edemez (sadece OWNER edebilir)', async () => {
    const adminEmail = `e2e-admin${emailSuffix}`;
    const promoteRes = await request(app.getHttpServer())
      .patch(`/api/v1/users/${viewerId}/role`)
      .set('Cookie', ownerCookies)
      .send({ role: 'ADMIN' });
    expect(promoteRes.status).toBe(200);

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: viewerEmail, password: 'sifre1234' });
    const adminCookies = loginRes.headers['set-cookie'] as unknown as string[];

    const forbiddenRes = await request(app.getHttpServer())
      .post('/api/v1/users/invite')
      .set('Cookie', adminCookies)
      .send({ email: adminEmail, role: 'ADMIN' });
    expect(forbiddenRes.status).toBe(403);
    expect(forbiddenRes.body.error.code).toBe('FORBIDDEN');

    const allowedRes = await request(app.getHttpServer())
      .post('/api/v1/users/invite')
      .set('Cookie', adminCookies)
      .send({ email: adminEmail, role: 'VIEWER' });
    expect(allowedRes.status).toBe(201);
  });
});

describe('Kullanici profili (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const testRunId = randomUUID();
  const emailSuffix = `-${testRunId}@test.com`;
  const email = `e2e-profile${emailSuffix}`;
  const otherEmail = `e2e-profile-other${emailSuffix}`;
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

    const registerRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        tenantName: 'Profil E2E Firma',
        name: 'Profil Kisi',
        email,
        password: 'sifre1234',
      });
    cookies = registerRes.headers['set-cookie'] as unknown as string[];

    await request(app.getHttpServer()).post('/api/v1/auth/register').send({
      tenantName: 'Profil E2E Diger Firma',
      name: 'Baska Kisi',
      email: otherEmail,
      password: 'sifre1234',
    });
  });

  afterAll(async () => {
    await cleanupTestTenants(prisma, emailSuffix);
    await app.close();
  });

  it('kullanici kendi profilini goruntuler', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Cookie', cookies);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(email);
    expect(res.body.role).toBe('OWNER');
    expect(res.body.createdAt).toBeDefined();
  });

  it('kullanici kendi adini ve e-postasini gunceller', async () => {
    const newEmail = `e2e-profile-updated${emailSuffix}`;
    const res = await request(app.getHttpServer())
      .patch('/api/v1/users/me')
      .set('Cookie', cookies)
      .send({ name: 'Guncel Isim', email: newEmail });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Guncel Isim');
    expect(res.body.email).toBe(newEmail);
  });

  it('baskasina ait e-postaya gecemez (EMAIL_TAKEN)', async () => {
    const res = await request(app.getHttpServer())
      .patch('/api/v1/users/me')
      .set('Cookie', cookies)
      .send({ email: otherEmail });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('yanlis mevcut sifreyle sifre degistirilemez (INVALID_CREDENTIALS)', async () => {
    const res = await request(app.getHttpServer())
      .patch('/api/v1/users/me/password')
      .set('Cookie', cookies)
      .send({ currentPassword: 'yanlis-sifre', newPassword: 'yenisifre1234' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('dogru mevcut sifreyle sifre degistirilir ve yeni sifreyle giris yapilir', async () => {
    const res = await request(app.getHttpServer())
      .patch('/api/v1/users/me/password')
      .set('Cookie', cookies)
      .send({ currentPassword: 'sifre1234', newPassword: 'yenisifre1234' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: `e2e-profile-updated${emailSuffix}`,
        password: 'yenisifre1234',
      });
    expect(loginRes.status).toBe(201);
  });
});
