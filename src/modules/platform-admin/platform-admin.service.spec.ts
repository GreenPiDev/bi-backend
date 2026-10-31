import { describe, expect, it, vi } from 'vitest';
import { PlatformAdminService } from './platform-admin.service';

type ServiceDeps = ConstructorParameters<typeof PlatformAdminService>;

function createService(findMany: ReturnType<typeof vi.fn>) {
  const prisma = { user: { findMany } } as unknown as ServiceDeps[0];
  const unused = {} as never;
  return new PlatformAdminService(
    prisma,
    unused,
    unused,
    unused,
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
