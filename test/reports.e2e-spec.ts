import { randomUUID } from 'node:crypto';
import { getQueueToken } from '@nestjs/bullmq';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Queue } from 'bullmq';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/core/filters/http-exception.filter';
import { PrismaService } from '../src/core/prisma/prisma.service';
import { REPORTS_QUEUE } from '../src/jobs/reports-queue.constants';

describe('Reports (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let reportsQueue: Queue;

  const emailSuffix = `-${randomUUID()}@test.com`;
  const ownerEmailA = `owner-a${emailSuffix}`;
  const ownerEmailB = `owner-b${emailSuffix}`;
  const password = 'sifre1234';

  let cookiesA: string[];
  let cookiesB: string[];
  let viewerCookies: string[];
  let dashboardId: string;
  let reportId: string;

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
    reportsQueue = app.get(getQueueToken(REPORTS_QUEUE));

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
      .send({ name: 'Rapor Panosu' });
    dashboardId = dashboardRes.body.id as string;
  }, 30_000);

  afterAll(async () => {
    if (reportId) {
      await reportsQueue.removeJobScheduler(reportId).catch(() => undefined);
    }
    await prisma.user.deleteMany({
      where: { email: { endsWith: emailSuffix } },
    });
    await app.close();
  });

  it('POST /reports gecersiz cron icin 400 doner', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/reports')
      .set('Cookie', cookiesA)
      .send({ dashboardId, cron: 'her gun', recipients: ['a@test.com'] });
    expect(res.status).toBe(400);
  });

  it('POST /reports yeni rapor olusturur ve zamanlayiciyi kaydeder', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/reports')
      .set('Cookie', cookiesA)
      .send({
        dashboardId,
        cron: '0 8 * * 1',
        recipients: ['alici@test.com'],
      });
    expect(res.status).toBe(201);
    expect(res.body.cron).toBe('0 8 * * 1');
    reportId = res.body.id as string;

    const scheduler = await reportsQueue.getJobScheduler(reportId);
    expect(scheduler?.pattern).toBe('0 8 * * 1');
  });

  it('VIEWER rapor listeleyemez (403)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/reports')
      .set('Cookie', viewerCookies);
    expect(res.status).toBe(403);
  });

  it('GET /reports tenant A icin raporu listeler', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/reports')
      .set('Cookie', cookiesA);
    expect(res.status).toBe(200);
    expect((res.body as { id: string }[]).map((r) => r.id)).toContain(reportId);
  });

  it('B tenanti A tenantinin raporunu guncelleyemez (404)', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/reports/${reportId}`)
      .set('Cookie', cookiesB)
      .send({ isActive: false });
    expect(res.status).toBe(404);
  });

  it('PATCH /reports/:id isActive false yapinca zamanlayici kaldirilir', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/reports/${reportId}`)
      .set('Cookie', cookiesA)
      .send({ isActive: false });
    expect(res.status).toBe(200);
    expect(res.body.isActive).toBe(false);

    const scheduler = await reportsQueue.getJobScheduler(reportId);
    expect(scheduler).toBeFalsy();
  });

  it('DELETE /reports/:id raporu siler', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/v1/reports/${reportId}`)
      .set('Cookie', cookiesA);
    expect(res.status).toBe(204);

    const listRes = await request(app.getHttpServer())
      .get('/api/v1/reports')
      .set('Cookie', cookiesA);
    expect((listRes.body as { id: string }[]).map((r) => r.id)).not.toContain(
      reportId,
    );
    reportId = '';
  });
});
