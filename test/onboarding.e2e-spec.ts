import { randomUUID } from 'node:crypto';
import * as path from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/core/filters/http-exception.filter';

const FIXTURES_DIR = path.join(__dirname, 'fixtures');

async function waitForReady(
  app: INestApplication,
  cookies: string[],
  dataSourceId: string,
  timeoutMs = 15_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/datasources/${dataSourceId}/status`)
      .set('Cookie', cookies);
    if (res.body.status === 'READY') {
      return res.body.datasetId as string;
    }
    if (res.body.status === 'FAILED') {
      throw new Error(`Ingest failed: ${res.body.errorMessage}`);
    }
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for READY, last=${res.body.status}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}

describe('Onboarding (e2e)', () => {
  let app: INestApplication;

  const emailSuffix = `-${randomUUID()}@test.com`;
  const ownerEmail = `owner${emailSuffix}`;
  const password = 'sifre1234';
  let cookies: string[];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    const register = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        tenantName: 'Onboarding Tenant',
        name: 'Owner',
        email: ownerEmail,
        password,
      });
    cookies = register.headers['set-cookie'] as unknown as string[];
  });

  afterAll(async () => {
    await app.close();
  });

  it('demo-dataset: demo verisini kiraciya yukler ve ingest eder', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/onboarding/demo-dataset')
      .set('Cookie', cookies);

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();

    const datasetId = await waitForReady(app, cookies, res.body.id as string);
    expect(datasetId).toBeDefined();
  });

  it('dashboard: yuklenen veriden olcu/boyut/tarihe gore otomatik pano kurar', async () => {
    const uploadRes = await request(app.getHttpServer())
      .post('/api/v1/datasources/upload')
      .set('Cookie', cookies)
      .field('name', 'Perakende Satis')
      .attach('file', path.join(FIXTURES_DIR, 'perakende-satis.csv'));
    const datasetId = await waitForReady(
      app,
      cookies,
      uploadRes.body.id as string,
    );

    const res = await request(app.getHttpServer())
      .post('/api/v1/onboarding/dashboard')
      .set('Cookie', cookies)
      .send({ datasetId });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();

    const dashboardRes = await request(app.getHttpServer())
      .get(`/api/v1/dashboards/${res.body.id as string}`)
      .set('Cookie', cookies);
    expect(dashboardRes.status).toBe(200);
    expect(dashboardRes.body.widgets.length).toBeGreaterThan(0);
    expect(dashboardRes.body.layout.length).toBe(
      dashboardRes.body.widgets.length,
    );
  });

  it('dashboard: gecersiz datasetId icin 400 doner', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/onboarding/dashboard')
      .set('Cookie', cookies)
      .send({ datasetId: 'not-a-uuid' });
    expect(res.status).toBe(400);
  });
});
