import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/core/filters/http-exception.filter';
import { PrismaService } from '../src/core/prisma/prisma.service';

describe('Alerts (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const emailSuffix = `-${randomUUID()}@test.com`;
  const ownerEmailA = `owner-a${emailSuffix}`;
  const ownerEmailB = `owner-b${emailSuffix}`;
  const password = 'sifre1234';

  let cookiesA: string[];
  let cookiesB: string[];
  let viewerCookies: string[];
  let dashboardId: string;
  let widgetId: string;
  let alertId: string;

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
    cookiesA = registerA.headers['set-cookie'] as unknown as string[];

    const registerB = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        tenantName: 'Tenant B',
        name: 'Owner B',
        email: ownerEmailB,
        password,
      });
    cookiesB = registerB.headers['set-cookie'] as unknown as string[];

    const inviteRes = await request(app.getHttpServer())
      .post('/api/v1/users/invite')
      .set('Cookie', cookiesA)
      .send({ email: `viewer${emailSuffix}`, role: 'VIEWER' });
    const acceptRes = await request(app.getHttpServer())
      .post(`/api/v1/invitations/${inviteRes.body.token as string}/accept`)
      .send({ name: 'Viewer', password });
    viewerCookies = acceptRes.headers['set-cookie'] as unknown as string[];

    const dashboardRes = await request(app.getHttpServer())
      .post('/api/v1/dashboards')
      .set('Cookie', cookiesA)
      .send({ name: 'Alarm Panosu' });
    dashboardId = dashboardRes.body.id as string;

    const widgetRes = await request(app.getHttpServer())
      .post(`/api/v1/dashboards/${dashboardId}/widgets`)
      .set('Cookie', cookiesA)
      .send({
        type: 'kpi',
        title: 'Toplam Tutar',
        querySpec: {
          datasetId: randomUUID(),
          measures: [{ field: 'tutar', agg: 'sum', alias: 'toplam' }],
          dimensions: [],
          filters: [],
          orderBy: [],
        },
        position: { x: 0, y: 0, w: 2, h: 2 },
      });
    widgetId = widgetRes.body.id as string;
  }, 30_000);

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { endsWith: emailSuffix } },
    });
    await app.close();
  });

  it('POST /alerts gecersiz operator icin 400 doner', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/alerts')
      .set('Cookie', cookiesA)
      .send({
        widgetId,
        operator: 'below',
        threshold: 1000,
        recipients: ['a@test.com'],
      });
    expect(res.status).toBe(400);
  });

  it('POST /alerts yeni alarm olusturur', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/alerts')
      .set('Cookie', cookiesA)
      .send({
        widgetId,
        operator: 'lt',
        threshold: 1000,
        recipients: ['a@test.com'],
      });
    expect(res.status).toBe(201);
    expect(res.body.operator).toBe('lt');
    alertId = res.body.id as string;
  });

  it('VIEWER alarm listeleyemez (403)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/alerts')
      .set('Cookie', viewerCookies);
    expect(res.status).toBe(403);
  });

  it('GET /alerts tenant A icin alarmi listeler', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/alerts')
      .set('Cookie', cookiesA);
    expect(res.status).toBe(200);
    expect((res.body as { id: string }[]).map((a) => a.id)).toContain(alertId);
  });

  it('B tenanti A tenantinin widget id siyle alarm olusturamaz (404)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/alerts')
      .set('Cookie', cookiesB)
      .send({
        widgetId,
        operator: 'lt',
        threshold: 1000,
        recipients: ['b@test.com'],
      });
    expect(res.status).toBe(404);
  });

  it('B tenanti A tenantinin alarmini guncelleyemez (404)', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/alerts/${alertId}`)
      .set('Cookie', cookiesB)
      .send({ threshold: 500 });
    expect(res.status).toBe(404);
  });

  it('PATCH /alerts/:id esik degerini gunceller', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/alerts/${alertId}`)
      .set('Cookie', cookiesA)
      .send({ threshold: 500 });
    expect(res.status).toBe(200);
    expect(res.body.threshold).toBe(500);
  });

  it('DELETE /alerts/:id alarmi siler', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/v1/alerts/${alertId}`)
      .set('Cookie', cookiesA);
    expect(res.status).toBe(204);

    const listRes = await request(app.getHttpServer())
      .get('/api/v1/alerts')
      .set('Cookie', cookiesA);
    expect((listRes.body as { id: string }[]).map((a) => a.id)).not.toContain(
      alertId,
    );
  });
});
