import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/core/filters/http-exception.filter';
import { PrismaService } from '../src/core/prisma/prisma.service';
import { cleanupTestTenants } from './support/cleanup-tenants';

describe('Interactions (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const emailSuffix = `-${randomUUID()}@test.com`;
  const ownerEmailA = `owner-a${emailSuffix}`;
  const ownerEmailB = `owner-b${emailSuffix}`;
  const password = 'sifre1234';

  let tenantIdA: string;
  let tenantIdB: string;
  let userIdA: string;
  let cookiesA: string[];
  let cookiesB: string[];
  let accountIdA: string;
  let interactionId: string;

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
    userIdA = registerA.body.user.id as string;
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

  it("'crm' modulu kapaliyken POST /interactions 403 doner", async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/interactions')
      .set('Cookie', cookiesA)
      .send({
        accountName: 'Deneme A.S.',
        type: 'CALL',
        notes: 'Ilk gorusme',
        occurredAt: '2026-01-01T10:00:00.000Z',
      });
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
    const account = await prisma.account.create({
      data: { tenantId: tenantIdA, name: 'Bilinen Firma' },
    });
    accountIdA = account.id;
  });

  it('POST /interactions: M2 - accountName ile bilinmeyen firma otomatik olusur', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/interactions')
      .set('Cookie', cookiesA)
      .send({
        accountName: 'Bilinmeyen Firma',
        contactName: 'Ahmet Yilmaz',
        type: 'VISIT',
        notes: 'Ziyaret notlari',
        occurredAt: '2026-01-01T10:00:00.000Z',
      });
    expect(res.status).toBe(201);
    expect(res.body.interaction.accountAutoCreated).toBe(true);
    expect(res.body.interaction.contactAutoCreated).toBe(true);
    expect(res.body.interaction.account.name).toBe('Bilinmeyen Firma');
    expect(res.body.interaction.contact.firstName).toBe('Ahmet');
  });

  it('POST /interactions: bilinen accountId ile ve M3/O1 gomulu firsatla olusturur', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/interactions')
      .set('Cookie', cookiesA)
      .send({
        accountId: accountIdA,
        type: 'MEETING',
        notes: 'Toplanti notlari',
        occurredAt: '2026-01-02T10:00:00.000Z',
        opportunity: { name: 'Yeni sunucu ihtiyaci', estimatedValue: 50000 },
      });
    expect(res.status).toBe(201);
    expect(res.body.interaction.accountId).toBe(accountIdA);
    expect(res.body.interaction.opportunity.name).toBe('Yeni sunucu ihtiyaci');
    interactionId = res.body.interaction.id as string;
  });

  it('POST /interactions: M9 - gecmis tarihli hatirlatma 400 doner', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/interactions')
      .set('Cookie', cookiesA)
      .send({
        accountId: accountIdA,
        type: 'CALL',
        notes: 'notlar',
        occurredAt: '2026-01-01T10:00:00.000Z',
        reminder: {
          startAt: '2020-01-01T10:00:00.000Z',
          assignees: [{ userId: userIdA }],
        },
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('REMINDER_PAST_DATE');
  });

  it('POST /interactions: M4-M7 - hatirlatma etkinligi olusur, ikinci cakisan istek reminderConflicts doner', async () => {
    const startAt = new Date(Date.now() + 60 * 60_000).toISOString();
    const first = await request(app.getHttpServer())
      .post('/api/v1/interactions')
      .set('Cookie', cookiesA)
      .send({
        accountId: accountIdA,
        type: 'CALL',
        notes: 'ilk hatirlatmali gorusme',
        occurredAt: '2026-01-01T10:00:00.000Z',
        reminder: { startAt, assignees: [{ userId: userIdA }] },
      });
    expect(first.status).toBe(201);
    expect(first.body.reminderConflicts).toEqual([]);

    const second = await request(app.getHttpServer())
      .post('/api/v1/interactions')
      .set('Cookie', cookiesA)
      .send({
        accountId: accountIdA,
        type: 'CALL',
        notes: 'ikinci hatirlatmali gorusme (cakisiyor)',
        occurredAt: '2026-01-01T10:00:00.000Z',
        reminder: { startAt, assignees: [{ userId: userIdA }] },
      });
    expect(second.status).toBe(201);
    expect(second.body.reminderConflicts).toEqual([
      expect.objectContaining({ userId: userIdA }),
    ]);
  });

  it('GET /interactions: sayfali liste doner', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/interactions')
      .set('Cookie', cookiesA);
    expect(res.status).toBe(200);
    expect((res.body.data as { id: string }[]).map((i) => i.id)).toContain(
      interactionId,
    );
  });

  it('PATCH /interactions/:id: M8 - durumu kapatir', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/interactions/${interactionId}`)
      .set('Cookie', cookiesA)
      .send({ status: 'CLOSED' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CLOSED');
  });

  it('B tenanti A tenantinin gorusmesine erisemez (404)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/interactions/${interactionId}`)
      .set('Cookie', cookiesB);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('DELETE /interactions/:id: gorusmeyi yumusak siler', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/v1/interactions/${interactionId}`)
      .set('Cookie', cookiesA);
    expect(res.status).toBe(204);

    const getRes = await request(app.getHttpServer())
      .get(`/api/v1/interactions/${interactionId}`)
      .set('Cookie', cookiesA);
    expect(getRes.status).toBe(404);
  });
});
