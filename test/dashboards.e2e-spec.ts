import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/core/filters/http-exception.filter';
import { PrismaService } from '../src/core/prisma/prisma.service';
import { cleanupTestTenants } from './support/cleanup-tenants';

describe('Dashboards (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const emailSuffix = `-${randomUUID()}@test.com`;
  const ownerEmailA = `owner-a${emailSuffix}`;
  const ownerEmailB = `owner-b${emailSuffix}`;
  const password = 'sifre1234';

  let cookiesA: string[];
  let cookiesB: string[];
  let dashboardId: string;

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
  }, 30_000);

  afterAll(async () => {
    await cleanupTestTenants(prisma, emailSuffix);
    await app.close();
  });

  it('POST /dashboards yeni pano olusturur', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/dashboards')
      .set('Cookie', cookiesA)
      .send({ name: 'Satis Panosu' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Satis Panosu');
    dashboardId = res.body.id as string;
  });

  it('GET /dashboards tenant A icin panolari listeler', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/dashboards')
      .set('Cookie', cookiesA);
    expect(res.status).toBe(200);
    expect((res.body as { id: string }[]).map((d) => d.id)).toContain(
      dashboardId,
    );
  });

  it('GET /dashboards/:id widgets ile birlikte doner', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/dashboards/${dashboardId}`)
      .set('Cookie', cookiesA);
    expect(res.status).toBe(200);
    expect(res.body.widgets).toEqual([]);
  });

  it('PATCH /dashboards/:id layout gunceller', async () => {
    const layout = [{ widgetId: randomUUID(), x: 0, y: 0, w: 4, h: 2 }];
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/dashboards/${dashboardId}`)
      .set('Cookie', cookiesA)
      .send({ layout });
    expect(res.status).toBe(200);
    expect(res.body.layout).toEqual(layout);
  });

  it('VIEWER pano olusturamaz (403)', async () => {
    const inviteRes = await request(app.getHttpServer())
      .post('/api/v1/users/invite')
      .set('Cookie', cookiesA)
      .send({ email: `viewer${emailSuffix}`, role: 'VIEWER' });
    expect(inviteRes.status).toBe(201);
    const token = inviteRes.body.token as string;

    const acceptRes = await request(app.getHttpServer())
      .post(`/api/v1/invitations/${token}/accept`)
      .send({ name: 'Viewer A', password });
    const viewerCookies = acceptRes.headers['set-cookie'] as unknown as
      string[] | undefined;

    if (!viewerCookies) {
      throw new Error('Davet kabul edilemedi, cookie alinamadi.');
    }

    const res = await request(app.getHttpServer())
      .post('/api/v1/dashboards')
      .set('Cookie', viewerCookies)
      .send({ name: 'Viewer Panosu' });
    expect(res.status).toBe(403);
  });

  it('B tenanti A tenantinin panosuna erisemez (404)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/dashboards/${dashboardId}`)
      .set('Cookie', cookiesB);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('B tenanti A tenantinin panosunu guncelleyemez (404)', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/dashboards/${dashboardId}`)
      .set('Cookie', cookiesB)
      .send({ name: 'ele gecirme' });
    expect(res.status).toBe(404);
  });

  it('DELETE /dashboards/:id panoyu siler', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/v1/dashboards/${dashboardId}`)
      .set('Cookie', cookiesA);
    expect(res.status).toBe(204);

    const getRes = await request(app.getHttpServer())
      .get(`/api/v1/dashboards/${dashboardId}`)
      .set('Cookie', cookiesA);
    expect(getRes.status).toBe(404);
  });
});
