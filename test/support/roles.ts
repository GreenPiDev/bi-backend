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

/** roleIds ile dogrudan bir kullanici olusturur (POST /users, sistemin uretttigi gecici
 * sifreyle giris yapar) ve oturum cookie'lerini doner. */
export async function inviteAndAcceptWithRoles(
  app: INestApplication,
  ownerCookies: string[],
  email: string,
  roleIds: string[],
  name = 'Test Kullanici',
): Promise<string[]> {
  const createRes = await request(app.getHttpServer())
    .post('/api/v1/users')
    .set('Cookie', ownerCookies)
    .send({ email, name, roleIds });
  if (createRes.status !== 201) {
    throw new Error(
      `Kullanici olusturulamadi (${createRes.status}): ${JSON.stringify(createRes.body)}`,
    );
  }
  const temporaryPassword = createRes.body.temporaryPassword as string;

  const loginRes = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password: temporaryPassword });
  const cookies = loginRes.headers['set-cookie'] as unknown as
    string[] | undefined;
  if (!cookies) {
    throw new Error('Giris yapilamadi, cookie alinamadi.');
  }
  return cookies;
}

/** Sik kullanilan senaryo: izin verilmeyen (bos) bir rol olusturup kullaniciyi olusturur. */
export async function inviteUserWithNoPermissions(
  app: INestApplication,
  ownerCookies: string[],
  email: string,
  roleName = `Yetkisiz-${Math.random().toString(36).slice(2, 8)}`,
): Promise<string[]> {
  const roleId = await createTestRole(app, ownerCookies, roleName, []);
  return inviteAndAcceptWithRoles(app, ownerCookies, email, [roleId]);
}
