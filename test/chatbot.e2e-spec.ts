import { randomUUID } from 'node:crypto';
import * as path from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { RawSqlService } from '../src/core/database/raw-sql.service';
import { HttpExceptionFilter } from '../src/core/filters/http-exception.filter';
import { PrismaService } from '../src/core/prisma/prisma.service';
import { OPENAI_CLIENT } from '../src/modules/chatbot/openai-client.token';
import { cleanupTestTenants } from './support/cleanup-tenants';

const FIXTURES_DIR = path.join(__dirname, 'fixtures');

function textCompletion(content: string) {
  return {
    choices: [
      { message: { role: 'assistant', content, tool_calls: undefined } },
    ],
  };
}

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

describe('Chatbot (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let rawSql: RawSqlService;
  let createMock: ReturnType<typeof vi.fn>;

  const emailSuffix = `-${randomUUID()}@test.com`;
  const ownerEmailA = `owner-a${emailSuffix}`;
  const ownerEmailB = `owner-b${emailSuffix}`;
  const password = 'sifre1234';

  let tenantAId: string;
  let cookiesA: string[];
  let cookiesB: string[];
  let datasetId: string;

  beforeAll(async () => {
    createMock = vi
      .fn()
      .mockResolvedValue(
        textCompletion('Merhaba, size nasil yardimci olabilirim?'),
      );

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(OPENAI_CLIENT)
      .useValue({ chat: { completions: { create: createMock } } })
      .compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);
    rawSql = app.get(RawSqlService);

    const registerA = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        tenantName: 'Tenant A',
        name: 'Owner A',
        email: ownerEmailA,
        password,
      });
    tenantAId = registerA.body.user.tenantId as string;
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

    const uploadRes = await request(app.getHttpServer())
      .post('/api/v1/datasources/upload')
      .set('Cookie', cookiesA)
      .field('name', 'Perakende Satis')
      .attach('file', path.join(FIXTURES_DIR, 'perakende-satis.csv'));

    datasetId = await waitForReady(app, cookiesA, uploadRes.body.id as string);
  }, 30_000);

  afterAll(async () => {
    if (datasetId) {
      await rawSql.dropTable(tenantAId, datasetId).catch(() => undefined);
    }
    await cleanupTestTenants(prisma, emailSuffix);
    await app.close();
  });

  it("A tenant'inin sistem promptu sadece kendi veri kumesini icerir", async () => {
    createMock.mockClear();
    const res = await request(app.getHttpServer())
      .post('/api/v1/chatbot/message')
      .set('Cookie', cookiesA)
      .send({ message: 'merhaba', history: [] });

    expect(res.status).toBe(201);
    const systemPrompt = createMock.mock.calls[0][0].messages[0]
      .content as string;
    expect(systemPrompt).toContain('Perakende Satis');
  });

  it("B tenant'inin sistem promptunda A'nin veri kumesi hic gecmez (tenant izolasyonu)", async () => {
    createMock.mockClear();
    const res = await request(app.getHttpServer())
      .post('/api/v1/chatbot/message')
      .set('Cookie', cookiesB)
      .send({ message: 'merhaba', history: [] });

    expect(res.status).toBe(201);
    const systemPrompt = createMock.mock.calls[0][0].messages[0]
      .content as string;
    expect(systemPrompt).not.toContain('Perakende Satis');
  });

  it('gecersiz istek govdesi 400 doner', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/chatbot/message')
      .set('Cookie', cookiesA)
      .send({ message: '' });

    expect(res.status).toBe(400);
  });

  it('dakikada 15 istek sinirini asinca 429 doner', async () => {
    createMock.mockClear();
    let lastStatus = 200;
    for (let i = 0; i < 16; i++) {
      const res = await request(app.getHttpServer())
        .post('/api/v1/chatbot/message')
        .set('Cookie', cookiesA)
        .send({ message: `soru ${i}`, history: [] });
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});
