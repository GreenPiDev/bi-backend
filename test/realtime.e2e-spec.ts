import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { INestApplication } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/core/filters/http-exception.filter';
import { PrismaService } from '../src/core/prisma/prisma.service';
import { cleanupTestTenants } from './support/cleanup-tenants';

function toCookieHeader(setCookies: string[]): string {
  return setCookies.map((cookie) => cookie.split(';')[0]).join('; ');
}

describe('Realtime gateway (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;

  const emailSuffix = `-${randomUUID()}@test.com`;
  const adminEmail = `platform-admin${emailSuffix}`;
  const ownerEmail = `owner${emailSuffix}`;
  const password = 'sifre1234';

  let tenantId: string;
  let adminCookies: string[];
  let ownerCookieHeader: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useWebSocketAdapter(new IoAdapter(app));
    await app.listen(0);
    prisma = app.get(PrismaService);

    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;

    const adminRegisterRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        tenantName: 'Platform Sirket',
        name: 'Admin',
        email: adminEmail,
        password,
      });
    await prisma.user.update({
      where: { id: adminRegisterRes.body.user.id as string },
      data: { isPlatformAdmin: true },
    });
    const adminLoginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: adminEmail, password });
    adminCookies = adminLoginRes.headers['set-cookie'] as unknown as string[];

    const ownerRegisterRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        tenantName: 'Test Sirket',
        name: 'Owner',
        email: ownerEmail,
        password,
      });
    tenantId = ownerRegisterRes.body.user.tenantId as string;
    ownerCookieHeader = toCookieHeader(
      ownerRegisterRes.headers['set-cookie'] as unknown as string[],
    );
  });

  afterAll(async () => {
    await cleanupTestTenants(prisma, emailSuffix);
    await app.close();
  });

  it('platform-admin bir tenantin modulunu actiginda o tenant"in socket"i tenant.modules.updated eventini alir', async () => {
    const socket: Socket = io(baseUrl, {
      extraHeaders: { Cookie: ownerCookieHeader },
      transports: ['websocket'],
      forceNew: true,
    });

    try {
      await new Promise<void>((resolve, reject) => {
        socket.on('connect', () => resolve());
        socket.on('connect_error', reject);
      });

      const eventPromise = new Promise<{ key: string; enabled: boolean }[]>(
        (resolve) => {
          socket.on('tenant.modules.updated', resolve);
        },
      );

      const patchRes = await request(app.getHttpServer())
        .patch(`/api/v1/platform-admin/tenants/${tenantId}/modules/crm`)
        .set('Cookie', adminCookies)
        .send({ enabled: true });
      expect(patchRes.status).toBe(200);

      const payload = await eventPromise;
      const crmEntry = payload.find((m) => m.key === 'crm');
      expect(crmEntry).toMatchObject({ key: 'crm', enabled: true });
    } finally {
      socket.disconnect();
    }
  });

  it('platform-admin sayfa-modul eslemesini degistirdiginde TUM baglantilar page-modules.updated eventini alir', async () => {
    const socket: Socket = io(baseUrl, {
      extraHeaders: { Cookie: ownerCookieHeader },
      transports: ['websocket'],
      forceNew: true,
    });

    try {
      await new Promise<void>((resolve, reject) => {
        socket.on('connect', () => resolve());
        socket.on('connect_error', reject);
      });

      const eventPromise = new Promise<
        { pageKey: string; moduleKeys: string[] }[]
      >((resolve) => {
        socket.on('page-modules.updated', resolve);
      });

      const patchRes = await request(app.getHttpServer())
        .patch('/api/v1/platform-admin/page-modules/profile')
        .set('Cookie', adminCookies)
        .send({ moduleKeys: ['crm'] });
      expect(patchRes.status).toBe(200);

      const payload = await eventPromise;
      const profileEntry = payload.find((row) => row.pageKey === 'profile');
      expect(profileEntry).toMatchObject({
        pageKey: 'profile',
        moduleKeys: ['crm'],
      });
    } finally {
      await request(app.getHttpServer())
        .patch('/api/v1/platform-admin/page-modules/profile')
        .set('Cookie', adminCookies)
        .send({ moduleKeys: [] });
      socket.disconnect();
    }
  });

  it('gecerli cookie olmadan baglanan socket derhal disconnect edilir', async () => {
    const socket: Socket = io(baseUrl, {
      transports: ['websocket'],
      forceNew: true,
    });

    try {
      await new Promise<void>((resolve, reject) => {
        socket.on('disconnect', () => resolve());
        setTimeout(() => reject(new Error('disconnect gelmedi')), 3000);
      });
    } finally {
      socket.disconnect();
    }
  });
});
