import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/core/filters/http-exception.filter';
import { PrismaService } from '../src/core/prisma/prisma.service';
import { cleanupTestTenants } from './support/cleanup-tenants';

describe('Platform admin (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const emailSuffix = `-${randomUUID()}@test.com`;
  const adminEmail = `platform-admin${emailSuffix}`;
  const normalEmail = `normal-owner${emailSuffix}`;
  const password = 'sifre1234';

  let adminTenantId: string;
  let adminCookies: string[];
  let normalCookies: string[];

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

    const adminRegisterRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        tenantName: 'Platform Sirket',
        name: 'Admin',
        email: adminEmail,
        password,
      });
    adminTenantId = adminRegisterRes.body.user.tenantId as string;

    await prisma.user.update({
      where: { id: adminRegisterRes.body.user.id as string },
      data: { isPlatformAdmin: true },
    });

    const adminLoginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: adminEmail, password });
    adminCookies = adminLoginRes.headers['set-cookie'] as unknown as string[];

    const normalRegisterRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        tenantName: 'Normal Sirket',
        name: 'Normal Owner',
        email: normalEmail,
        password,
      });
    normalCookies = normalRegisterRes.headers[
      'set-cookie'
    ] as unknown as string[];
  });

  afterAll(async () => {
    await prisma.pageModuleAssignment.deleteMany({
      where: { pageKey: 'profile' },
    });
    await cleanupTestTenants(prisma, emailSuffix);
    await app.close();
  });

  it('platform-admin olmayan kullanici tenant listesine erisemez (403)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/platform-admin/tenants')
      .set('Cookie', normalCookies);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('platform-admin tenant listesini gorur', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/platform-admin/tenants')
      .set('Cookie', adminCookies);

    expect(res.status).toBe(200);
    const ids = (res.body as { id: string }[]).map((t) => t.id);
    expect(ids).toContain(adminTenantId);
    const tenant = (
      res.body as { id: string; adminEmail: string | null }[]
    ).find((t) => t.id === adminTenantId);
    expect(tenant?.adminEmail).toBe(adminEmail);
  });

  it('platform-admin olmayan kullanici yeni kiraci olusturamaz (403)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/platform-admin/tenants')
      .set('Cookie', normalCookies)
      .send({
        tenantName: 'Yetkisiz Kiraci',
        adminName: 'Yetkisiz Admin',
        adminEmail: `yetkisiz${emailSuffix}`,
      });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('platform-admin yeni bir kiraci ve ilk COMPANYADMIN kullanicisini olusturur', async () => {
    const newAdminEmail = `yeni-musteri${emailSuffix}`;
    const res = await request(app.getHttpServer())
      .post('/api/v1/platform-admin/tenants')
      .set('Cookie', adminCookies)
      .send({
        tenantName: 'Yeni Musteri A.S.',
        adminName: 'Yeni Musteri Admin',
        adminEmail: newAdminEmail,
      });

    expect(res.status).toBe(201);
    expect(res.body.tenant.name).toBe('Yeni Musteri A.S.');
    expect(res.body.tenant.adminEmail).toBe(newAdminEmail);
    expect(typeof res.body.temporaryPassword).toBe('string');
    expect((res.body.temporaryPassword as string).length).toBe(6);

    const newTenantId = res.body.tenant.id as string;
    const newLoginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: newAdminEmail, password: res.body.temporaryPassword });
    expect(newLoginRes.status).toBe(201);
    expect(newLoginRes.body.user.tenantId).toBe(newTenantId);
    const roleNames = (newLoginRes.body.user.roles as { name: string }[]).map(
      (r) => r.name,
    );
    expect(roleNames).toContain('COMPANYADMIN');
  });

  it('ayni e-posta ile ikinci kez kiraci olusturmaya calisilirsa EMAIL_TAKEN doner', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/platform-admin/tenants')
      .set('Cookie', adminCookies)
      .send({
        tenantName: 'Tekrar Kiraci',
        adminName: 'Tekrar Admin',
        adminEmail: adminEmail,
      });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('platform-admin olmayan kullanici bir kiracinin admin sifresini sifirlayamaz (403)', async () => {
    const res = await request(app.getHttpServer())
      .post(
        `/api/v1/platform-admin/tenants/${adminTenantId}/reset-admin-password`,
      )
      .set('Cookie', normalCookies);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('platform-admin bir kiracinin COMPANYADMIN sifresini sifirlar ve yeni sifreyle giris yapilabilir', async () => {
    const res = await request(app.getHttpServer())
      .post(
        `/api/v1/platform-admin/tenants/${adminTenantId}/reset-admin-password`,
      )
      .set('Cookie', adminCookies);

    expect(res.status).toBe(201);
    expect(typeof res.body.temporaryPassword).toBe('string');
    expect((res.body.temporaryPassword as string).length).toBe(6);

    const oldPasswordLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: adminEmail, password });
    expect(oldPasswordLogin.status).toBe(401);

    const newPasswordLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: adminEmail, password: res.body.temporaryPassword });
    expect(newPasswordLogin.status).toBe(201);

    // Sonraki testler `adminCookies`'e guveniyor - sifirlamadan sonra tekrar giris
    // yapip cookie'yi guncelliyoruz.
    adminCookies = newPasswordLogin.headers[
      'set-cookie'
    ] as unknown as string[];
  });

  it('olmayan tenant icin sifre sifirlama NOT_FOUND doner', async () => {
    const res = await request(app.getHttpServer())
      .post(
        `/api/v1/platform-admin/tenants/${randomUUID()}/reset-admin-password`,
      )
      .set('Cookie', adminCookies);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('core modulu her tenant icin enabled=true, alwaysOn=true doner', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/platform-admin/tenants/${adminTenantId}/modules`)
      .set('Cookie', adminCookies);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { key: 'core', label: 'Cekirdek', alwaysOn: true, enabled: true },
      {
        key: 'analytics',
        label: 'Veri Analitigi',
        alwaysOn: false,
        enabled: false,
      },
      { key: 'crm', label: 'Satis (CRM)', alwaysOn: false, enabled: false },
    ]);
  });

  it('alwaysOn modul kapatilmaya calisilirsa MODULE_ALWAYS_ON doner', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/platform-admin/tenants/${adminTenantId}/modules/core`)
      .set('Cookie', adminCookies)
      .send({ enabled: false });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MODULE_ALWAYS_ON');
  });

  it('bilinmeyen modul icin UNKNOWN_MODULE doner', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/platform-admin/tenants/${adminTenantId}/modules/yok`)
      .set('Cookie', adminCookies)
      .send({ enabled: true });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNKNOWN_MODULE');
  });

  it('olmayan tenant icin NOT_FOUND doner', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/platform-admin/tenants/${randomUUID()}/modules`)
      .set('Cookie', adminCookies);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('platform-admin modul tanimlarini gorur', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/platform-admin/modules')
      .set('Cookie', adminCookies);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { key: 'core', label: 'Cekirdek', alwaysOn: true },
      { key: 'analytics', label: 'Veri Analitigi', alwaysOn: false },
      { key: 'crm', label: 'Satis (CRM)', alwaysOn: false },
    ]);
  });

  it('platform-admin olmayan kullanici sayfa-modul eslemesine erisemez (403)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/platform-admin/page-modules')
      .set('Cookie', normalCookies);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('platform-admin sayfa-modul eslemesini gorur, migration seed degerlerini icerir', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/platform-admin/page-modules')
      .set('Cookie', adminCookies);

    expect(res.status).toBe(200);
    const byPageKey = new Map(
      (res.body as { pageKey: string; moduleKeys: string[] }[]).map((row) => [
        row.pageKey,
        row.moduleKeys,
      ]),
    );
    expect(byPageKey.get('accounts')).toEqual(['crm']);
    expect(byPageKey.get('contacts')).toEqual(['crm']);
    expect(byPageKey.get('dashboards')).toEqual(['analytics']);
    expect(byPageKey.get('datasets')).toEqual(['analytics']);
    expect(byPageKey.get('profile')).toEqual([]);
  });

  it('platform-admin bir sayfayi birden fazla modulle eslestirebilir', async () => {
    const res = await request(app.getHttpServer())
      .patch('/api/v1/platform-admin/page-modules/profile')
      .set('Cookie', adminCookies)
      .send({ moduleKeys: ['crm', 'core'] });

    expect(res.status).toBe(200);
    const profile = (
      res.body as { pageKey: string; moduleKeys: string[] }[]
    ).find((row) => row.pageKey === 'profile');
    expect(profile?.moduleKeys).toEqual(['crm', 'core']);
  });

  it('platform-admin bir sayfanin eslemesini kaldirabilir (moduleKeys: [])', async () => {
    const res = await request(app.getHttpServer())
      .patch('/api/v1/platform-admin/page-modules/profile')
      .set('Cookie', adminCookies)
      .send({ moduleKeys: [] });

    expect(res.status).toBe(200);
    const profile = (
      res.body as { pageKey: string; moduleKeys: string[] }[]
    ).find((row) => row.pageKey === 'profile');
    expect(profile?.moduleKeys).toEqual([]);
  });

  it('bilinmeyen pageKey icin UNKNOWN_PAGE doner', async () => {
    const res = await request(app.getHttpServer())
      .patch('/api/v1/platform-admin/page-modules/yok-boyle-sayfa')
      .set('Cookie', adminCookies)
      .send({ moduleKeys: ['crm'] });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNKNOWN_PAGE');
  });

  it('bilinmeyen moduleKey icin UNKNOWN_MODULE doner', async () => {
    const res = await request(app.getHttpServer())
      .patch('/api/v1/platform-admin/page-modules/profile')
      .set('Cookie', adminCookies)
      .send({ moduleKeys: ['yok-boyle-modul'] });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNKNOWN_MODULE');
  });

  // Faz 11f (R1-R2, bkz. docs/VARSAYIMLAR.md V29): 'crm' modulu acilinca/kapaninca
  // sentetik CRM rapor dataset'i otomatik saglanip kaldirilmali.
  it("'crm' modulu acilinca CRM rapor dataset'i otomatik olusur", async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/platform-admin/tenants/${adminTenantId}/modules/crm`)
      .set('Cookie', adminCookies)
      .send({ enabled: true });

    expect(res.status).toBe(200);

    const dataset = await prisma.dataset.findFirst({
      where: {
        tenantId: adminTenantId,
        sourceKind: 'CRM_TABLE',
        physicalTable: 'crm_quote_line_report',
      },
      include: { fields: true },
    });
    expect(dataset).not.toBeNull();
    expect(dataset?.fields.length).toBeGreaterThan(0);
  });

  it("'crm' modulu tekrar acilirsa dataset cogaltilmaz (idempotent)", async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/platform-admin/tenants/${adminTenantId}/modules/crm`)
      .set('Cookie', adminCookies)
      .send({ enabled: true });

    expect(res.status).toBe(200);

    const datasets = await prisma.dataset.findMany({
      where: { tenantId: adminTenantId, sourceKind: 'CRM_TABLE' },
    });
    expect(datasets).toHaveLength(1);
  });

  it("'crm' modulu kapaninca CRM rapor dataset'i silinir", async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/platform-admin/tenants/${adminTenantId}/modules/crm`)
      .set('Cookie', adminCookies)
      .send({ enabled: false });

    expect(res.status).toBe(200);

    const datasets = await prisma.dataset.findMany({
      where: { tenantId: adminTenantId, sourceKind: 'CRM_TABLE' },
    });
    expect(datasets).toHaveLength(0);
  });
});
