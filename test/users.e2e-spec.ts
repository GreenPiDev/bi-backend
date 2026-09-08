import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/core/filters/http-exception.filter';
import { PrismaService } from '../src/core/prisma/prisma.service';
import { cleanupTestTenants } from './support/cleanup-tenants';
import { createTestRole } from './support/roles';

describe('Users (e2e)', () => {
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
  let viewerTemporaryPassword: string;
  let viewerRoleId: string;
  let editorRoleId: string;
  let companyAdminRoleId: string;

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

  it('COMPANYADMIN kaydolur', async () => {
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
    companyAdminRoleId = res.body.user.roles[0].id as string;

    viewerRoleId = await createTestRole(app, ownerCookies, 'Goruntuleyici', [
      { pageKey: 'dashboards', actions: ['VIEW'] },
    ]);
    editorRoleId = await createTestRole(app, ownerCookies, 'Editor', [
      {
        pageKey: 'dashboards',
        actions: ['VIEW', 'CREATE', 'UPDATE', 'DELETE'],
      },
    ]);
  });

  it('kimliksiz users listesi 401 doner', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/users');
    expect(res.status).toBe(401);
  });

  it('COMPANYADMIN, Goruntuleyici rolunde kullanici olusturur', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Cookie', ownerCookies)
      .send({
        email: viewerEmail,
        name: 'Viewer Kisi',
        roleIds: [viewerRoleId],
      });
    expect(res.status).toBe(201);
    expect(res.body.temporaryPassword).toMatch(/^\d{6}$/);
    expect(res.body.user.roles).toEqual([
      expect.objectContaining({ id: viewerRoleId, name: 'Goruntuleyici' }),
    ]);
    viewerId = res.body.user.id;
    viewerTemporaryPassword = res.body.temporaryPassword as string;

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: viewerEmail, password: viewerTemporaryPassword });
    expect(loginRes.status).toBe(201);
    viewerCookies = loginRes.headers['set-cookie'] as unknown as string[];
  });

  it('halihazirda kullanicisi olan email icin EMAIL_TAKEN doner', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Cookie', ownerCookies)
      .send({ email: ownerEmail, name: 'X', roleIds: [viewerRoleId] });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('COMPANYADMIN olmayan kullanici yeni kullanici olusturamaz (403)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Cookie', viewerCookies)
      .send({
        email: `baska${emailSuffix}`,
        name: 'Y',
        roleIds: [viewerRoleId],
      });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('COMPANYADMIN olmayan kullanici rol degistiremez, 403 FORBIDDEN doner', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/users/${viewerId}/role`)
      .set('Cookie', viewerCookies)
      .send({ roleIds: [editorRoleId] });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('COMPANYADMIN, Goruntuleyici rolunu Editor yapabilir', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/users/${viewerId}/role`)
      .set('Cookie', ownerCookies)
      .send({ roleIds: [editorRoleId] });
    expect(res.status).toBe(200);
    expect(res.body.roles).toEqual([
      expect.objectContaining({ id: editorRoleId, name: 'Editor' }),
    ]);
  });

  it('COMPANYADMIN kendi rolunu degistiremez (CANNOT_CHANGE_OWN_ROLE)', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/users/${ownerId}/role`)
      .set('Cookie', ownerCookies)
      .send({ roleIds: [editorRoleId] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('CANNOT_CHANGE_OWN_ROLE');
  });

  it('COMPANYADMIN baska bir kullaniciya birden fazla rol atayabilir', async () => {
    const promoteRes = await request(app.getHttpServer())
      .patch(`/api/v1/users/${viewerId}/role`)
      .set('Cookie', ownerCookies)
      .send({ roleIds: [companyAdminRoleId, editorRoleId] });
    expect(promoteRes.status).toBe(200);
    expect(
      (promoteRes.body.roles as { name: string }[]).map((r) => r.name).sort(),
    ).toEqual(['COMPANYADMIN', 'Editor']);

    const demoteRes = await request(app.getHttpServer())
      .patch(`/api/v1/users/${viewerId}/role`)
      .set('Cookie', ownerCookies)
      .send({ roleIds: [editorRoleId] });
    expect(demoteRes.status).toBe(200);
    expect(demoteRes.body.roles).toEqual([
      expect.objectContaining({ id: editorRoleId, name: 'Editor' }),
    ]);
  });

  it('users listesi tum tenant kullanicilarini doner', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Cookie', ownerCookies);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
    expect(res.body.every((u: { tenantId: string }) => u.tenantId)).toBe(true);
  });

  it('COMPANYADMIN baska bir kullanicinin sifresini sifirlayabilir', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/users/${viewerId}/reset-password`)
      .set('Cookie', ownerCookies);
    expect(res.status).toBe(201);
    const newPassword = res.body.temporaryPassword as string;
    expect(newPassword).toMatch(/^\d{6}$/);
    expect(newPassword).not.toBe(viewerTemporaryPassword);

    const oldLoginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: viewerEmail, password: viewerTemporaryPassword });
    expect(oldLoginRes.status).toBe(401);

    const newLoginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: viewerEmail, password: newPassword });
    expect(newLoginRes.status).toBe(201);
  });

  it('COMPANYADMIN kendi sifresini bu uctan sifirlayamaz (CANNOT_RESET_OWN_PASSWORD)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/users/${ownerId}/reset-password`)
      .set('Cookie', ownerCookies);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('CANNOT_RESET_OWN_PASSWORD');
  });

  it('COMPANYADMIN olmayan kullanici baskasinin sifresini sifirlayamaz (403)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/users/${ownerId}/reset-password`)
      .set('Cookie', viewerCookies);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
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
    expect(res.body.roles).toEqual([
      expect.objectContaining({ name: 'COMPANYADMIN' }),
    ]);
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

  it('yeni kullanicinin avatarUrl alani basta null doner', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Cookie', cookies);
    expect(res.status).toBe(200);
    expect(res.body.avatarUrl).toBeNull();
  });

  // R2 ortam degiskenleri yerelde/CI'da tanimli olmayabilir (bkz. .env.example) - o
  // durumda bu test atlanir, konfigurasyon-yoksa-STORAGE_NOT_CONFIGURED davranisi
  // core/storage/r2-storage.service.spec.ts'te ag'a cikmadan test ediliyor.
  it.runIf(Boolean(process.env.R2_ACCOUNT_ID))(
    'POST /users/me/avatar + DELETE: gercek R2 bucket ina yukler, herkese acik URL doner, kaldirir',
    async () => {
      // gecerli bir 1x1 PNG (magic-byte dogrulamasini gecmesi icin)
      const pngBuffer = Buffer.from(
        '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000100e221bc330000000049454e44ae426082',
        'hex',
      );
      const uploadRes = await request(app.getHttpServer())
        .post('/api/v1/users/me/avatar')
        .set('Cookie', cookies)
        .attach('file', pngBuffer, {
          filename: 'avatar.png',
          contentType: 'image/png',
        });
      expect(uploadRes.status).toBe(201);
      expect(uploadRes.body.avatarUrl).toContain('/files?key=');
      expect(uploadRes.body.avatarUrl).toContain(
        encodeURIComponent('avatars/'),
      );
      expect(uploadRes.body.avatarUrl).toContain(encodeURIComponent('.png'));

      const deleteRes = await request(app.getHttpServer())
        .delete('/api/v1/users/me/avatar')
        .set('Cookie', cookies);
      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.avatarUrl).toBeNull();
    },
  );

  it('POST /users/me/avatar: gecersiz magic-byte icin UNSUPPORTED_IMAGE_TYPE doner', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/users/me/avatar')
      .set('Cookie', cookies)
      .attach('file', Buffer.from('not-a-real-image'), {
        filename: 'avatar.png',
        contentType: 'image/png',
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNSUPPORTED_IMAGE_TYPE');
  });

  it('kimliksiz avatar yukleme 401 doner', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/users/me/avatar')
      .attach('file', Buffer.from('not-a-real-image'), {
        filename: 'avatar.png',
        contentType: 'image/png',
      });
    expect(res.status).toBe(401);
  });
});
