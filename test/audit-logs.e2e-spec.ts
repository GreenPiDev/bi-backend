import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/core/filters/http-exception.filter';
import { PrismaService } from '../src/core/prisma/prisma.service';
import { cleanupTestTenants } from './support/cleanup-tenants';
import { inviteUserWithNoPermissions } from './support/roles';

describe('Audit Logs (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const emailSuffix = `-${randomUUID()}@test.com`;
  const ownerEmail = `owner${emailSuffix}`;
  const password = 'sifre1234';

  let ownerCookies: string[];
  let viewerCookies: string[];

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
        tenantName: 'Audit Tenant',
        name: 'Owner',
        email: ownerEmail,
        password,
      });
    ownerCookies = registerRes.headers['set-cookie'] as unknown as string[];

    viewerCookies = await inviteUserWithNoPermissions(
      app,
      ownerCookies,
      `viewer${emailSuffix}`,
      password,
    );
  }, 30_000);

  afterAll(async () => {
    await cleanupTestTenants(prisma, emailSuffix);
    await app.close();
  });

  it('pano olusturunca denetim kaydi olusur ve GET /audit-logs icinde gorunur', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/dashboards')
      .set('Cookie', ownerCookies)
      .send({ name: 'Denetimli Pano' });
    expect(createRes.status).toBe(201);
    const dashboardId = createRes.body.id as string;

    const listRes = await request(app.getHttpServer())
      .get('/api/v1/audit-logs')
      .set('Cookie', ownerCookies);
    expect(listRes.status).toBe(200);
    const entry = (
      listRes.body as {
        action: string;
        entity: string;
        entityId: string;
        userName: string;
      }[]
    ).find((l) => l.entity === 'Dashboard' && l.entityId === dashboardId);
    expect(entry).toMatchObject({
      action: 'CREATE',
      entity: 'Dashboard',
      entityId: dashboardId,
      userName: 'Owner',
    });
  });

  it('VIEWER /audit-logs gorememeli (403)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/audit-logs')
      .set('Cookie', viewerCookies);
    expect(res.status).toBe(403);
  });
});
