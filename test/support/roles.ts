import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

interface PermissionInput {
  pageKey: string;
  actions: ('VIEW' | 'CREATE' | 'UPDATE' | 'DELETE')[];
}

/** Dinamik bir rol olusturur (COMPANYADMIN cookie'siyle) ve id'sini doner. */
export async function createTestRole(
  app: INestApplication,
  ownerCookies: string[],
  name: string,
  permissions: PermissionInput[],
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/v1/roles')
    .set('Cookie', ownerCookies)
    .send({ name, permissions });
  if (res.status !== 201) {
    throw new Error(
      `Rol olusturulamadi (${res.status}): ${JSON.stringify(res.body)}`,
    );
  }
  return res.body.id as string;
}

/** roleIds ile bir kullanici davet eder, daveti kabul eder ve oturum cookie'lerini doner. */
export async function inviteAndAcceptWithRoles(
  app: INestApplication,
  ownerCookies: string[],
  email: string,
  password: string,
  roleIds: string[],
  name = 'Test Kullanici',
): Promise<string[]> {
  const inviteRes = await request(app.getHttpServer())
    .post('/api/v1/users/invite')
    .set('Cookie', ownerCookies)
    .send({ email, roleIds });
  if (inviteRes.status !== 201) {
    throw new Error(
      `Davet olusturulamadi (${inviteRes.status}): ${JSON.stringify(inviteRes.body)}`,
    );
  }
  const token = inviteRes.body.token as string;

  const acceptRes = await request(app.getHttpServer())
    .post(`/api/v1/invitations/${token}/accept`)
    .send({ name, password });
  const cookies = acceptRes.headers['set-cookie'] as unknown as
    string[] | undefined;
  if (!cookies) {
    throw new Error('Davet kabul edilemedi, cookie alinamadi.');
  }
  return cookies;
}

/** Sik kullanilan senaryo: izin verilmeyen (bos) bir rol olusturup davet+kabul eder. */
export async function inviteUserWithNoPermissions(
  app: INestApplication,
  ownerCookies: string[],
  email: string,
  password: string,
  roleName = `Yetkisiz-${Math.random().toString(36).slice(2, 8)}`,
): Promise<string[]> {
  const roleId = await createTestRole(app, ownerCookies, roleName, []);
  return inviteAndAcceptWithRoles(app, ownerCookies, email, password, [roleId]);
}
