import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/core/filters/http-exception.filter';
import { PrismaService } from '../src/core/prisma/prisma.service';
import { cleanupTestTenants } from './support/cleanup-tenants';

describe('Contacts (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const emailSuffix = `-${randomUUID()}@test.com`;
  const ownerEmailA = `owner-a${emailSuffix}`;
  const ownerEmailB = `owner-b${emailSuffix}`;
  const password = 'sifre1234';

  let tenantIdA: string;
  let tenantIdB: string;
  let cookiesA: string[];
  let cookiesB: string[];
  let accountId: string;
  let contactId: string;

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
    await prisma.tenantModule.create({
      data: { tenantId: tenantIdB, moduleKey: 'crm' },
    });

    const accountRes = await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .set('Cookie', cookiesA)
      .send({ name: 'Acme A.S.' });
    accountId = accountRes.body.id as string;
  }, 30_000);

  afterAll(async () => {
    await cleanupTestTenants(prisma, emailSuffix);
    await app.close();
  });

  it('POST /contacts var olmayan firmaya baglanamaz (400)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/contacts')
      .set('Cookie', cookiesA)
      .send({ firstName: 'Ayse', lastName: 'Yilmaz', accountId: randomUUID() });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REFERENCE');
  });

  it('POST /contacts yeni kisi olusturur', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/contacts')
      .set('Cookie', cookiesA)
      .send({ firstName: 'Ayse', lastName: 'Yilmaz', accountId });
    expect(res.status).toBe(201);
    expect(res.body.lastName).toBe('Yilmaz');
    contactId = res.body.id as string;
  });

  it('GET /contacts firma bilgisiyle birlikte listeler', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/contacts')
      .set('Cookie', cookiesA);
    expect(res.status).toBe(200);
    const found = (
      res.body.data as { id: string; account: { id: string } }[]
    ).find((c) => c.id === contactId);
    expect(found?.account.id).toBe(accountId);
  });

  it('B tenanti A tenantinin kisisine erisemez (404)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/contacts/${contactId}`)
      .set('Cookie', cookiesB);
    expect(res.status).toBe(404);
  });

  it('DELETE /contacts/:id kisiyi siler', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/v1/contacts/${contactId}`)
      .set('Cookie', cookiesA);
    expect(res.status).toBe(204);

    const getRes = await request(app.getHttpServer())
      .get(`/api/v1/contacts/${contactId}`)
      .set('Cookie', cookiesA);
    expect(getRes.status).toBe(404);
  });
});
