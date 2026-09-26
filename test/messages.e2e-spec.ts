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

  it('POST /messages: yeni konusma baslatirken konu zorunludur (400)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/messages')
      .set('Cookie', cookiesA)
      .send({
        body: 'Konusuz mesaj',
        toUserIds: [recipientIdA],
      });
    expect(res.status).toBe(400);
  });

  it('POST /messages: TO + CC ile mesaj olusturur', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/messages')
      .set('Cookie', cookiesA)
      .send({
        subject: 'Teklif hakkinda',
        body: 'Bu ay ki teklif hakkinda konusalim.',
        toUserIds: [recipientIdA],
        ccUserIds: [],
      });
    expect(res.status).toBe(201);
    expect(res.body.senderId).toBe(ownerIdA);
    expect(res.body.subject).toBe('Teklif hakkinda');
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
    expect(res.body.subject).toBe('Teklif hakkinda');

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
    expect(res.status).toBe(204);

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

  it('PATCH /messages/:conversationId/read: { read: false } konusmayi tekrar okunmadi yapar', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/messages/${conversationId}/read`)
      .set('Cookie', recipientCookiesA)
      .send({ read: false });
    expect(res.status).toBe(204);

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
    expect(recipient?.readAt).toBeNull();
  });

  describe('kisisel yildizlama', () => {
    it('PATCH /messages/:conversationId/star: konusmayi goremeyen kullanici 404 alir', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/messages/${conversationId}/star`)
        .set('Cookie', bystanderCookiesA)
        .send({ starred: true });
      expect(res.status).toBe(404);
    });

    it('yildizlama once GET listede ve detayda starred=false gorunur', async () => {
      const listRes = await request(app.getHttpServer())
        .get('/api/v1/messages?box=inbox')
        .set('Cookie', recipientCookiesA);
      const summary = (
        listRes.body.data as { conversationId: string; starred: boolean }[]
      ).find((c) => c.conversationId === conversationId);
      expect(summary?.starred).toBe(false);

      const detailRes = await request(app.getHttpServer())
        .get(`/api/v1/messages/${conversationId}`)
        .set('Cookie', recipientCookiesA);
      expect(detailRes.body.starred).toBe(false);
    });

    it('PATCH /messages/:conversationId/star: { starred: true } sonrasi GET listede ve detayda starred=true gorunur, kisiseldir (baska kullaniciyi etkilemez)', async () => {
      const starRes = await request(app.getHttpServer())
        .patch(`/api/v1/messages/${conversationId}/star`)
        .set('Cookie', recipientCookiesA)
        .send({ starred: true });
      expect(starRes.status).toBe(204);

      const listRes = await request(app.getHttpServer())
        .get('/api/v1/messages?box=inbox')
        .set('Cookie', recipientCookiesA);
      const summary = (
        listRes.body.data as { conversationId: string; starred: boolean }[]
      ).find((c) => c.conversationId === conversationId);
      expect(summary?.starred).toBe(true);

      const detailRes = await request(app.getHttpServer())
        .get(`/api/v1/messages/${conversationId}`)
        .set('Cookie', recipientCookiesA);
      expect(detailRes.body.starred).toBe(true);

      // Gonderen ayni konusmayi kendi tarafindan yildizlamamis - kisisel oldugu dogrulanir.
      const senderDetailRes = await request(app.getHttpServer())
        .get(`/api/v1/messages/${conversationId}`)
        .set('Cookie', cookiesA);
      expect(senderDetailRes.body.starred).toBe(false);
    });

    it('PATCH /messages/:conversationId/star: { starred: false } yildizi kaldirir', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/messages/${conversationId}/star`)
        .set('Cookie', recipientCookiesA)
        .send({ starred: false });
      expect(res.status).toBe(204);

      const detailRes = await request(app.getHttpServer())
        .get(`/api/v1/messages/${conversationId}`)
        .set('Cookie', recipientCookiesA);
      expect(detailRes.body.starred).toBe(false);
    });
  });

  describe('kompozit ilgili-kayit filtresi', () => {
    const quoteId = randomUUID();
    const projectId = randomUUID();
    let quoteConversationId: string;
    let projectConversationId: string;

    beforeAll(async () => {
      const quoteRes = await request(app.getHttpServer())
        .post('/api/v1/messages')
        .set('Cookie', cookiesA)
        .send({
          subject: 'Teklife bagli mesaj',
          body: 'Teklif hakkinda.',
          toUserIds: [recipientIdA],
          relatedEntity: 'QUOTE',
          relatedEntityId: quoteId,
        });
      quoteConversationId = quoteRes.body.conversationId as string;

      const projectRes = await request(app.getHttpServer())
        .post('/api/v1/messages')
        .set('Cookie', cookiesA)
        .send({
          subject: 'Projeye bagli mesaj',
          body: 'Proje hakkinda.',
          toUserIds: [recipientIdA],
          relatedEntity: 'PROJECT',
          relatedEntityId: projectId,
        });
      projectConversationId = projectRes.body.conversationId as string;
    });

    function conversationIdsIn(body: unknown): string[] {
      return (body as { data: { conversationId: string }[] }).data.map(
        (c) => c.conversationId,
      );
    }

    it('relatedEntity coklu (?relatedEntity=QUOTE&relatedEntity=PROJECT) her iki turu de kapsar', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/messages?relatedEntity=QUOTE&relatedEntity=PROJECT')
        .set('Cookie', cookiesA);
      expect(res.status).toBe(200);
      const ids = conversationIdsIn(res.body);
      expect(ids).toContain(quoteConversationId);
      expect(ids).toContain(projectConversationId);
      expect(ids).not.toContain(conversationId);
    });

    it('quoteIds verilince sadece o teklife bagli konusmayi dondurur, digger tekliflerinki gelmez', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/messages?quoteIds=${quoteId}`)
        .set('Cookie', cookiesA);
      expect(res.status).toBe(200);
      const ids = conversationIdsIn(res.body);
      expect(ids).toContain(quoteConversationId);
      expect(ids).not.toContain(projectConversationId);
    });

    it('relatedEntity=QUOTE + projectIds birlikte verilince VEYA ile birlesir', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/messages?relatedEntity=QUOTE&projectIds=${projectId}`)
        .set('Cookie', cookiesA);
      expect(res.status).toBe(200);
      const ids = conversationIdsIn(res.body);
      expect(ids).toContain(quoteConversationId);
      expect(ids).toContain(projectConversationId);
    });
  });

  describe('Mesaj ekleri', () => {
    const pdfBuffer = Buffer.concat([
      Buffer.from('%PDF-1.4\n'),
      Buffer.from('fake pdf content'),
    ]);

    it.runIf(Boolean(process.env.R2_ACCOUNT_ID))(
      'POST /messages/attachments -> POST /messages: ek yukleyip mesaja bagliyor, /files proxy uzerinden indirilebiliyor',
      async () => {
        const uploadRes = await request(app.getHttpServer())
          .post('/api/v1/messages/attachments')
          .set('Cookie', cookiesA)
          .attach('file', pdfBuffer, {
            filename: 'teklif.pdf',
            contentType: 'application/pdf',
          });
        expect(uploadRes.status).toBe(201);
        expect(uploadRes.body.fileKey).toContain(`/${tenantIdA}/messages/`);
        expect(uploadRes.body.fileName).toBe('teklif.pdf');

        const createRes = await request(app.getHttpServer())
          .post('/api/v1/messages')
          .set('Cookie', cookiesA)
          .send({
            subject: 'Ekli mesaj',
            body: 'Ekte teklif var.',
            toUserIds: [recipientIdA],
            attachments: [uploadRes.body],
          });
        expect(createRes.status).toBe(201);
        expect(createRes.body.attachments).toHaveLength(1);
        expect(createRes.body.attachments[0]).toMatchObject({
          fileName: 'teklif.pdf',
          mimeType: 'application/pdf',
        });
        const attachmentUrl = createRes.body.attachments[0].url as string;
        const relativePath = attachmentUrl.replace(/^https?:\/\/[^/]+/, '');

        const downloadRes = await request(app.getHttpServer())
          .get(relativePath)
          .set('Cookie', recipientCookiesA);
        expect(downloadRes.status).toBe(200);
        expect(downloadRes.headers['content-type']).toBe('application/pdf');

        const crossTenantRes = await request(app.getHttpServer())
          .get(relativePath)
          .set('Cookie', cookiesB);
        expect(crossTenantRes.status).toBe(404);
      },
    );

    it.runIf(Boolean(process.env.R2_ACCOUNT_ID))(
      'POST /messages/attachments: desteklenmeyen tur icin UNSUPPORTED_ATTACHMENT_TYPE doner',
      async () => {
        const res = await request(app.getHttpServer())
          .post('/api/v1/messages/attachments')
          .set('Cookie', cookiesA)
          .attach('file', Buffer.from('not-a-real-pdf'), {
            filename: 'teklif.pdf',
            contentType: 'application/pdf',
          });
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('UNSUPPORTED_ATTACHMENT_TYPE');
      },
    );

    it.runIf(Boolean(process.env.R2_ACCOUNT_ID))(
      'DELETE /messages/attachments: yuklenmis ama gonderilmemis eki kaldirir, baska tenant kendi anahtarini silemez',
      async () => {
        const uploadRes = await request(app.getHttpServer())
          .post('/api/v1/messages/attachments')
          .set('Cookie', cookiesA)
          .attach('file', pdfBuffer, {
            filename: 'vazgecilen.pdf',
            contentType: 'application/pdf',
          });
        expect(uploadRes.status).toBe(201);
        const key = uploadRes.body.fileKey as string;

        const crossTenantDelete = await request(app.getHttpServer())
          .delete('/api/v1/messages/attachments')
          .query({ key })
          .set('Cookie', cookiesB);
        expect(crossTenantDelete.status).toBe(404);

        const deleteRes = await request(app.getHttpServer())
          .delete('/api/v1/messages/attachments')
          .query({ key })
          .set('Cookie', cookiesA);
        expect(deleteRes.status).toBe(204);
      },
    );

    it('POST /messages: attachments 5 taneden fazlaysa 400 doner', async () => {
      const tooMany = Array.from({ length: 6 }, (_, i) => ({
        fileKey: `PILENS/development/${tenantIdA}/messages/fake-${i}.pdf`,
        fileName: `dosya-${i}.pdf`,
        mimeType: 'application/pdf',
        sizeBytes: 100,
      }));
      const res = await request(app.getHttpServer())
        .post('/api/v1/messages')
        .set('Cookie', cookiesA)
        .send({
          subject: 'Cok ekli mesaj',
          body: 'Bu olmamali.',
          toUserIds: [recipientIdA],
          attachments: tooMany,
        });
      expect(res.status).toBe(400);
    });
  });
});
