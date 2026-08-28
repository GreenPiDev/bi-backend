import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { TenantContext } from '../src/core/tenant/tenant-context';
import { tenantScopedExtension } from '../src/core/prisma/tenant-scoped.extension';

describe('tenantScopedExtension (gercek Postgres)', () => {
  const raw = new PrismaClient();
  const scoped = tenantScopedExtension(raw);

  let tenantA: string;
  let tenantB: string;

  beforeAll(async () => {
    await raw.$connect();
    tenantA = randomUUID();
    tenantB = randomUUID();
    await raw.tenant.create({
      data: { id: tenantA, name: 'Tenant A', slug: `tenant-a-${tenantA}` },
    });
    await raw.tenant.create({
      data: { id: tenantB, name: 'Tenant B', slug: `tenant-b-${tenantB}` },
    });
  });

  afterAll(async () => {
    await raw.user.deleteMany({
      where: { tenantId: { in: [tenantA, tenantB] } },
    });
    await raw.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } });
    await raw.$disconnect();
  });

  it('TenantContext disisinda scoped okuma denenirse hata firlatir', async () => {
    await expect(scoped.user.findMany()).rejects.toThrow(
      'TenantContext disisinda',
    );
  });

  it('create sirasinda context tenantId payload tenantId yerine gecer', async () => {
    const user = await TenantContext.run(
      { tenantId: tenantA, userId: 'system', roleIds: [] },
      async () =>
        scoped.user.create({
          data: {
            tenantId: tenantB,
            email: `spoof-${randomUUID()}@test.com`,
            passwordHash: 'x',
            name: 'Spoof',
          },
        }),
    );
    expect(user.tenantId).toBe(tenantA);
  });

  it("A tenant'in kullanicisi B tenant'in kullanicisini findFirst ile goremez", async () => {
    const bUser = await TenantContext.run(
      { tenantId: tenantB, userId: 'system', roleIds: [] },
      async () =>
        scoped.user.create({
          data: {
            tenantId: tenantB,
            email: `b-${randomUUID()}@test.com`,
            passwordHash: 'x',
            name: 'B User',
          },
        }),
    );

    const foundFromA = await TenantContext.run(
      { tenantId: tenantA, userId: 'system', roleIds: [] },
      async () => scoped.user.findFirst({ where: { id: bUser.id } }),
    );

    expect(foundFromA).toBeNull();

    const foundFromB = await TenantContext.run(
      { tenantId: tenantB, userId: 'system', roleIds: [] },
      async () => scoped.user.findFirst({ where: { id: bUser.id } }),
    );

    expect(foundFromB?.id).toBe(bUser.id);
  });

  it("findMany sadece o tenant'in kayitlarini doner", async () => {
    await TenantContext.run(
      { tenantId: tenantA, userId: 'system', roleIds: [] },
      async () =>
        scoped.user.create({
          data: {
            tenantId: tenantA,
            email: `a-${randomUUID()}@test.com`,
            passwordHash: 'x',
            name: 'A User',
          },
        }),
    );

    const usersInA = await TenantContext.run(
      { tenantId: tenantA, userId: 'system', roleIds: [] },
      async () => scoped.user.findMany(),
    );

    expect(usersInA.every((u) => u.tenantId === tenantA)).toBe(true);
    expect(usersInA.length).toBeGreaterThan(0);
  });
});
