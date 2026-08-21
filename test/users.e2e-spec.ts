import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/core/filters/http-exception.filter';
import { PrismaService } from '../src/core/prisma/prisma.service';

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
    await prisma.user.deleteMany({
      where: { email: { endsWith: emailSuffix } },
    });
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
