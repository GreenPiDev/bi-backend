import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/core/filters/http-exception.filter';
import { PrismaService } from '../src/core/prisma/prisma.service';
import { cleanupTestTenants } from './support/cleanup-tenants';

interface TenantSession {
  tenantId: string;
  userId: string;
  cookies: string[];
}

describe('Kanban (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const emailSuffix = `-${randomUUID()}@test.com`;

  let a: TenantSession;
  let b: TenantSession;
  let c: TenantSession;
  let boardId: string;
  let cardId: string;

  async function register(label: string): Promise<TenantSession> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        tenantName: `Kanban ${label}`,
        name: `Owner ${label}`,
        email: `owner-${label}${emailSuffix}`,
        password: 'sifre1234',
      });
    return {
      tenantId: res.body.user.tenantId as string,
      userId: res.body.user.id as string,
      cookies: res.headers['set-cookie'] as unknown as string[],
    };
  }

  const api = () => request(app.getHttpServer());

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

    a = await register('a');
    b = await register('b');
    c = await register('c');
  }, 30_000);

  afterAll(async () => {
    await cleanupTestTenants(prisma, emailSuffix);
    await app.close();
  });

  it('rejects an unknown partner company code', async () => {
    const res = await api()
      .post('/api/v1/kanban/boards')
      .set('Cookie', a.cookies)
      .send({ name: 'X', partnerTenantId: randomUUID() });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('KANBAN_PARTNER_NOT_FOUND');
  });

  it('creates a board shared with tenant B', async () => {
    const res = await api()
      .post('/api/v1/kanban/boards')
      .set('Cookie', a.cookies)
      .send({ name: 'Ortak Proje', partnerTenantId: b.tenantId });
    expect(res.status).toBe(201);
    expect(res.body.partnerTenant.id).toBe(b.tenantId);
    boardId = res.body.id as string;
  });

  it('shows the shared board to both A and B, but not to C', async () => {
    const listA = await api()
      .get('/api/v1/kanban/boards')
      .set('Cookie', a.cookies);
    const listB = await api()
      .get('/api/v1/kanban/boards')
      .set('Cookie', b.cookies);
    const listC = await api()
      .get('/api/v1/kanban/boards')
      .set('Cookie', c.cookies);
    const ids = (body: { id: string }[]) => body.map((board) => board.id);
    expect(ids(listA.body)).toContain(boardId);
    expect(ids(listB.body)).toContain(boardId);
    expect(ids(listC.body)).not.toContain(boardId);
  });

  it('returns 404 (not 403) to an outsider tenant', async () => {
    const res = await api()
      .get(`/api/v1/kanban/boards/${boardId}`)
      .set('Cookie', c.cookies);
    expect(res.status).toBe(404);
    const card = await api()
      .post(`/api/v1/kanban/boards/${boardId}/cards`)
      .set('Cookie', c.cookies)
      .send({ title: 'Sizma', assigneeUserId: c.userId });
    expect(card.status).toBe(404);
  });

  it('partner B can add a card only with its own users as assignee', async () => {
    const foreign = await api()
      .post(`/api/v1/kanban/boards/${boardId}/cards`)
      .set('Cookie', b.cookies)
      .send({ title: 'Is', assigneeUserId: a.userId });
    expect(foreign.status).toBe(400);
    expect(foreign.body.error.code).toBe('USER_NOT_FOUND');

    const res = await api()
      .post(`/api/v1/kanban/boards/${boardId}/cards`)
      .set('Cookie', b.cookies)
      .send({ title: 'Is', description: 'Detay', assigneeUserId: b.userId });
    expect(res.status).toBe(201);
    expect(res.body.column).toBe('TODO');
    cardId = res.body.id as string;
  });

  it('owner A sees B user as external assignee without avatar', async () => {
    const res = await api()
      .get(`/api/v1/kanban/boards/${boardId}`)
      .set('Cookie', a.cookies);
    expect(res.status).toBe(200);
    const card = (
      res.body.cards as {
        id: string;
        assignee: { isExternal: boolean; avatarUrl: string | null };
      }[]
    ).find((item) => item.id === cardId);
    expect(card?.assignee).toMatchObject({ isExternal: true, avatarUrl: null });
  });

  it('moves the card to DONE and then locks it', async () => {
    const done = await api()
      .post(`/api/v1/kanban/boards/${boardId}/cards/${cardId}/move`)
      .set('Cookie', a.cookies)
      .send({ column: 'DONE', index: 0 });
    expect(done.status).toBe(204);

    const back = await api()
      .post(`/api/v1/kanban/boards/${boardId}/cards/${cardId}/move`)
      .set('Cookie', b.cookies)
      .send({ column: 'TODO', index: 0 });
    expect(back.status).toBe(409);
    expect(back.body.error.code).toBe('KANBAN_CARD_LOCKED');

    const edit = await api()
      .patch(`/api/v1/kanban/boards/${boardId}/cards/${cardId}`)
      .set('Cookie', a.cookies)
      .send({ title: 'Yeni' });
    expect(edit.status).toBe(409);
  });

  it('only the owner tenant can delete the board', async () => {
    const byPartner = await api()
      .delete(`/api/v1/kanban/boards/${boardId}`)
      .set('Cookie', b.cookies);
    expect(byPartner.status).toBe(403);
    expect(byPartner.body.error.code).toBe('KANBAN_BOARD_OWNER_ONLY');

    const byOwner = await api()
      .delete(`/api/v1/kanban/boards/${boardId}`)
      .set('Cookie', a.cookies);
    expect(byOwner.status).toBe(204);

    const afterDelete = await api()
      .get(`/api/v1/kanban/boards/${boardId}`)
      .set('Cookie', b.cookies);
    expect(afterDelete.status).toBe(404);
  });
});
