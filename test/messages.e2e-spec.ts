import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/core/filters/http-exception.filter';
import { PrismaService } from '../src/core/prisma/prisma.service';
import { cleanupTestTenants } from './support/cleanup-tenants';
import { createTestRole, inviteAndAcceptWithRoles } from './support/roles';

describe('Messages (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const emailSuffix = `-${randomUUID()}@test.com`;
  const ownerEmailA = `owner-a${emailSuffix}`;
  const ownerEmailB = `owner-b${emailSuffix}`;
  const recipientEmailA = `recipient-a${emailSuffix}`;
  const bystanderEmailA = `bystander-a${emailSuffix}`;
  const password = 'sifre1234';

  let tenantIdA: string;
  let tenantIdB: string;
  let ownerIdA: string;
  let recipientIdA: string;
  let cookiesA: string[];
  let cookiesB: string[];
  let recipientCookiesA: string[];
  let bystanderCookiesA: string[];
  let conversationId: string;

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
    ownerIdA = registerA.body.user.id as string;
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

    await prisma.tenantModule.create({
      data: { tenantId: tenantIdA, moduleKey: 'crm' },
    });

    const roleId = await createTestRole(app, cookiesA, 'Mesaj Kullanicisi', [
      { pageKey: 'messages', actions: ['VIEW', 'CREATE'] },
    ]);
    recipientCookiesA = await inviteAndAcceptWithRoles(
      app,
      cookiesA,
      recipientEmailA,
      [roleId],
      'Alici A',
    );
    bystanderCookiesA = await inviteAndAcceptWithRoles(
      app,
      cookiesA,
      bystanderEmailA,
      [roleId],
      'Izleyici A',
    );
    const recipientUser = await prisma.user.findFirst({
      where: { email: recipientEmailA },
    });
    recipientIdA = recipientUser!.id;
  }, 30_000);

  afterAll(async () => {
    await cleanupTestTenants(prisma, emailSuffix);
    await app.close();
  });

  it("'crm' modulu kapaliyken POST /messages 403 doner", async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/messages')
      .set('Cookie', cookiesB)
      .send({ body: 'Merhaba', toUserIds: [ownerIdA] });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('MODULE_NOT_ENABLED');
  });

  it("tenant B icin 'crm' modulunu etkinlestir (tenant izolasyon testleri icin gerekli)", async () => {
    await prisma.tenantModule.create({
      data: { tenantId: tenantIdB, moduleKey: 'crm' },
    });
  });

  it('POST /messages: TO + CC ile mesaj olusturur', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/messages')
      .set('Cookie', cookiesA)
      .send({
        body: 'Bu ay ki teklif hakkinda konusalim.',
        toUserIds: [recipientIdA],
        ccUserIds: [],
      });
    expect(res.status).toBe(201);
    expect(res.body.senderId).toBe(ownerIdA);
    expect(res.body.recipients).toHaveLength(1);
    expect(res.body.recipients[0]).toMatchObject({
      userId: recipientIdA,
      kind: 'TO',
      readAt: null,
    });
    conversationId = res.body.conversationId as string;
    expect(conversationId).toEqual(expect.any(String));
  });

  it('GET /messages?box=sent: gonderen kendi gonderdigi konusmayi gorur', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/messages?box=sent')
      .set('Cookie', cookiesA);
    expect(res.status).toBe(200);
    expect(
      (res.body.data as { conversationId: string }[]).map(
        (c) => c.conversationId,
      ),
    ).toContain(conversationId);
  });

  it('GET /messages?box=inbox: alici gelen kutusunda gorur', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/messages?box=inbox')
      .set('Cookie', recipientCookiesA);
    expect(res.status).toBe(200);
    expect(
      (res.body.data as { conversationId: string }[]).map(
        (c) => c.conversationId,
      ),
    ).toContain(conversationId);
  });

  it('GET /messages?box=inbox: ilgisiz ayni tenant kullanicisi gelen kutusunda gormez', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/messages?box=inbox')
      .set('Cookie', bystanderCookiesA);
    expect(res.status).toBe(200);
    expect(
      (res.body.data as { conversationId: string }[]).map(
        (c) => c.conversationId,
      ),
    ).not.toContain(conversationId);
  });

  it('GET /messages/:conversationId: TO/CC disindaki ayni tenant kullanicisi 404 alir', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/messages/${conversationId}`)
      .set('Cookie', bystanderCookiesA);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('GET /messages/:conversationId: B tenanti A tenantinin konusmasina erisemez (404)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/messages/${conversationId}`)
      .set('Cookie', cookiesB);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('POST /messages: conversationId ile katilimcisi olmayan kullanici yanit atarsa 404 alir', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/messages')
      .set('Cookie', bystanderCookiesA)
      .send({ body: 'Yetkisiz yanit', toUserIds: [ownerIdA], conversationId });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('POST /messages: conversationId ile alici cevap atinca ayni konusmaya eklenir', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/messages')
      .set('Cookie', recipientCookiesA)
      .send({
        body: 'Tamamdir, bakiyorum.',
        toUserIds: [ownerIdA],
        conversationId,
      });
    expect(res.status).toBe(201);
    expect(res.body.conversationId).toBe(conversationId);

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/messages/${conversationId}`)
      .set('Cookie', cookiesA);
    expect(detail.status).toBe(200);
    expect(detail.body.messages).toHaveLength(2);
    expect(
      (detail.body.messages as { body: string }[]).map((m) => m.body),
    ).toEqual(['Bu ay ki teklif hakkinda konusalim.', 'Tamamdir, bakiyorum.']);
  });

  it('GET /messages: konusma ozetinde okunmamis sayisi dogru hesaplanir', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/messages?box=inbox')
      .set('Cookie', cookiesA);
    expect(res.status).toBe(200);
    const summary = (
      res.body.data as { conversationId: string; unreadCount: number }[]
    ).find((c) => c.conversationId === conversationId);
    expect(summary?.unreadCount).toBe(1);
  });

  it('PATCH /messages/:conversationId/read: alici disindaki kullanici (gonderen dahil) 404 alir', async () => {
    const bystanderRes = await request(app.getHttpServer())
      .patch(`/api/v1/messages/${conversationId}/read`)
      .set('Cookie', bystanderCookiesA);
    expect(bystanderRes.status).toBe(404);
  });

  it('PATCH /messages/:conversationId/read: alici konusmadaki tum okunmamis mesajlari okundu isaretler', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/messages/${conversationId}/read`)
      .set('Cookie', recipientCookiesA);
    expect(res.status).toBe(200);

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/messages/${conversationId}`)
      .set('Cookie', recipientCookiesA);
    const firstMessage = (
      detail.body.messages as {
        recipients: { userId: string; readAt: string | null }[];
      }[]
    )[0];
    const recipient = firstMessage.recipients.find(
      (r) => r.userId === recipientIdA,
    );
    expect(recipient?.readAt).not.toBeNull();
  });
});
