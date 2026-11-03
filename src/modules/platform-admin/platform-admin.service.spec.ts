import { describe, expect, it, vi } from 'vitest';
import { PlatformAdminService } from './platform-admin.service';

type ServiceDeps = ConstructorParameters<typeof PlatformAdminService>;

function createService(
  findMany: ReturnType<typeof vi.fn>,
  extra: Record<string, ReturnType<typeof vi.fn>> = {},
  emitToTenant: ReturnType<typeof vi.fn> = vi.fn(),
) {
  const prisma = { user: { findMany, ...extra } } as unknown as ServiceDeps[0];
  const unused = {} as never;
  const realtime = { emitToTenant } as unknown as ServiceDeps[3];
  return new PlatformAdminService(
    prisma,
    unused,
    unused,
    realtime,
    unused,
    unused,
    unused,
    unused,
  );
}

describe('PlatformAdminService.listDemoUsers', () => {
  it('sadece demo kullanicilarini en yeni once listeler ve satiri duzlestirir', async () => {
    const createdAt = new Date('2026-10-31T10:00:00Z');
    const findMany = vi.fn().mockResolvedValue([
      {
        id: 'u1',
        name: 'Ziyaretci',
        demoCompanyName: 'Ornek A.S.',
        email: 'z@ornek.com',
        phone: '0555',
        isActive: true,
        createdAt,
        lastLoginAt: null,
        demoExpiresAt: null,
        tenant: { slug: 'demo' },
      },
    ]);
    const result = await createService(findMany).listDemoUsers();

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isDemoUser: true },
        orderBy: { createdAt: 'desc' },
      }),
    );
    expect(result).toEqual([
      {
        id: 'u1',
        name: 'Ziyaretci',
        companyName: 'Ornek A.S.',
        email: 'z@ornek.com',
        phone: '0555',
        isActive: true,
        createdAt,
        lastLoginAt: null,
        demoExpiresAt: null,
        tenantSlug: 'demo',
      },
    ]);
  });
});

describe('PlatformAdminService.extendDemoUser', () => {
  const row = {
    id: 'u1',
    name: 'Z',
    demoCompanyName: null,
    email: 'z@o.com',
    phone: null,
    isActive: true,
    createdAt: new Date(),
    lastLoginAt: null,
    demoExpiresAt: new Date(),
    tenant: { slug: 'demo' },
  };

  it('sureyi simdiden itibaren hesaplar ve hesabi aktif eder', async () => {
    const findFirst = vi.fn().mockResolvedValue({ tenantId: 't1' });
    const update = vi.fn().mockResolvedValue(row);
    const before = Date.now();
    await createService(vi.fn(), { findFirst, update }).extendDemoUser('u1', {
      days: 1,
      hours: 2,
      minutes: 30,
    });
    const data = update.mock.calls[0][0].data as {
      demoExpiresAt: Date;
      isActive: boolean;
    };
    const expectedMs = (26 * 60 + 30) * 60_000;
    expect(data.isActive).toBe(true);
    expect(data.demoExpiresAt.getTime() - before).toBeGreaterThanOrEqual(
      expectedMs,
    );
    expect(data.demoExpiresAt.getTime() - before).toBeLessThan(
      expectedMs + 5000,
    );
  });

  it('demo kullanicisi yoksa 404 firlatir', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    await expect(
      createService(vi.fn(), { findFirst, update: vi.fn() }).extendDemoUser(
        'x',
        {
          days: 1,
          hours: 0,
          minutes: 0,
        },
      ),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('PlatformAdminService.deactivateDemoUser', () => {
  it('denemeyi hemen bitirir, hesabi aktif birakir', async () => {
    const findFirst = vi.fn().mockResolvedValue({ tenantId: 't1' });
    const update = vi.fn().mockResolvedValue({
      id: 'u1',
      name: 'Z',
      demoCompanyName: null,
      email: 'z@o.com',
      phone: null,
      isActive: false,
      createdAt: new Date(),
      lastLoginAt: null,
      demoExpiresAt: null,
      tenant: { slug: 'demo' },
    });
    const result = await createService(vi.fn(), {
      findFirst,
      update,
    }).deactivateDemoUser('u1');
    const data = update.mock.calls[0][0].data as Record<string, unknown>;
    expect(Object.keys(data)).toEqual(['demoExpiresAt']);
    expect(data.demoExpiresAt).toBeInstanceOf(Date);
    expect(result.id).toBe('u1');
  });
});
