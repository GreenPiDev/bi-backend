import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/core/filters/http-exception.filter';
import { PrismaService } from '../src/core/prisma/prisma.service';
import { cleanupTestTenants } from './support/cleanup-tenants';

describe('GET /tenants/me/modules (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const emailSuffix = `-${randomUUID()}@test.com`;
  const ownerEmailA = `owner-a${emailSuffix}`;
  const password = 'sifre1234';

  let tenantIdA: string;
  let cookiesA: string[];

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
    cookiesA = registerA.headers['set-cookie'] as unknown as string[];
  }, 30_000);

  afterAll(async () => {
    await cleanupTestTenants(prisma, emailSuffix);
    await app.close();
  });

  it('crm modulu kapaliyken enabled=false doner', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/tenants/me/modules')
      .set('Cookie', cookiesA);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { key: 'core', label: 'Cekirdek', alwaysOn: true, enabled: true },
      { key: 'crm', label: 'Satis (CRM)', alwaysOn: false, enabled: false },
    ]);
  });

  it('crm modulu etkinlestirilince enabled=true doner', async () => {
    await prisma.tenantModule.create({
      data: { tenantId: tenantIdA, moduleKey: 'crm' },
    });
    const res = await request(app.getHttpServer())
      .get('/api/v1/tenants/me/modules')
      .set('Cookie', cookiesA);
    expect(res.status).toBe(200);
    expect(
      (res.body as { key: string; enabled: boolean }[]).find(
        (m) => m.key === 'crm',
      )?.enabled,
    ).toBe(true);
  });
});
