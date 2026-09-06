import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/core/filters/http-exception.filter';
import { PrismaService } from '../src/core/prisma/prisma.service';
import { cleanupTestTenants } from './support/cleanup-tenants';

describe('CalendarEvents (e2e)', () => {
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
  let eventId: string;

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

  it("'crm' modulu kapaliyken POST /calendar-events 403 doner", async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/calendar-events')
      .set('Cookie', cookiesA)
      .send({
        title: 'Musteri ziyareti',
        startAt: '2026-09-10T10:00:00.000Z',
        endAt: '2026-09-10T11:00:00.000Z',
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
  });

  it('GET /calendar-events/assignable-users: tenant kullanicilarini doner', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/calendar-events/assignable-users')
      .set('Cookie', cookiesA);
    expect(res.status).toBe(200);
    expect((res.body as { id: string }[]).map((u) => u.id)).toContain(userIdA);
  });

  it('POST /calendar-events: attendee verilmezse olusturan kullaniciyi ekler', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/calendar-events')
      .set('Cookie', cookiesA)
      .send({
        title: 'Musteri ziyareti',
        startAt: '2026-09-10T10:00:00.000Z',
        endAt: '2026-09-10T11:00:00.000Z',
      });
    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Musteri ziyareti');
    expect(res.body.attendees).toEqual([
      expect.objectContaining({ userId: userIdA }),
    ]);
    eventId = res.body.id as string;
  });

  it("POST /calendar-events: endAt startAt'tan onceyse 400 doner", async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/calendar-events')
      .set('Cookie', cookiesA)
      .send({
        title: 'Gecersiz',
        startAt: '2026-09-10T12:00:00.000Z',
        endAt: '2026-09-10T10:00:00.000Z',
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('GET /calendar-events: from/to araligiyla filtreler', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/calendar-events')
      .query({
        from: '2026-09-01T00:00:00.000Z',
        to: '2026-09-30T23:59:59.000Z',
      })
      .set('Cookie', cookiesA);
    expect(res.status).toBe(200);
    expect((res.body as { id: string }[]).map((e) => e.id)).toContain(eventId);
  });

  it('GET /calendar-events: araligin disinda kalan etkinligi listelemez', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/calendar-events')
      .query({
        from: '2026-10-01T00:00:00.000Z',
        to: '2026-10-31T23:59:59.000Z',
      })
      .set('Cookie', cookiesA);
    expect(res.status).toBe(200);
    expect((res.body as { id: string }[]).map((e) => e.id)).not.toContain(
      eventId,
    );
  });

  it('PATCH /calendar-events/:id basligi gunceller', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/calendar-events/${eventId}`)
      .set('Cookie', cookiesA)
      .send({ title: 'Musteri ziyareti (guncellendi)' });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Musteri ziyareti (guncellendi)');
  });

  it('B tenanti A tenantinin etkinligine erisemez (404)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/calendar-events/${eventId}`)
      .set('Cookie', cookiesB);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('B tenantinin listesi A tenantinin etkinligini icermez', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/calendar-events')
      .set('Cookie', cookiesB);
    expect(res.status).toBe(200);
    expect((res.body as { id: string }[]).map((e) => e.id)).not.toContain(
      eventId,
    );
  });

  it('DELETE /calendar-events/:id etkinligi yumusak siler', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/v1/calendar-events/${eventId}`)
      .set('Cookie', cookiesA);
    expect(res.status).toBe(204);

    const getRes = await request(app.getHttpServer())
      .get(`/api/v1/calendar-events/${eventId}`)
      .set('Cookie', cookiesA);
    expect(getRes.status).toBe(404);
  });
});
