import { TenantContext } from '../../core/tenant/tenant-context';
import { AuditService } from './audit.service';

function createPrisma() {
  return {
    auditLog: {
      create: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
    },
    user: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
}

const store = { tenantId: 't1', userId: 'u1', role: 'OWNER' as const };

describe('AuditService', () => {
  it('log: TenantContext disindaysa sessizce hicbir sey yapmaz', async () => {
    const prisma = createPrisma();
    const service = new AuditService(prisma as never);
    await service.log({
      action: 'CREATE',
      entity: 'Dashboard',
      entityId: 'd1',
    });
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('log: TenantContext icindeyken guncel kullaniciyla kayit olusturur', async () => {
    const prisma = createPrisma();
    const service = new AuditService(prisma as never);
    await TenantContext.run(store, () =>
      service.log({
        action: 'CREATE',
        entity: 'Dashboard',
        entityId: 'd1',
        meta: { name: 'Satis Panosu' },
      }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        tenantId: 't1',
        userId: 'u1',
        action: 'CREATE',
        entity: 'Dashboard',
        entityId: 'd1',
        meta: { name: 'Satis Panosu' },
      },
    });
  });

  it('log: prisma hata firlatirsa yutulur, cagiran akisi kesilmez', async () => {
    const prisma = createPrisma();
    prisma.auditLog.create.mockRejectedValue(new Error('db down'));
    const service = new AuditService(prisma as never);
    await expect(
      TenantContext.run(store, () =>
        service.log({ action: 'CREATE', entity: 'Dashboard', entityId: 'd1' }),
      ),
    ).resolves.toBeUndefined();
  });

  it('list: kullanicilari eslestirip isim/e-posta ile doner', async () => {
    const prisma = createPrisma();
    prisma.auditLog.findMany.mockResolvedValue([
      {
        id: 'a1',
        userId: 'u1',
        action: 'CREATE',
        entity: 'Dashboard',
        entityId: 'd1',
        meta: null,
        createdAt: new Date('2026-08-22T00:00:00.000Z'),
      },
    ]);
    prisma.user.findMany.mockResolvedValue([
      { id: 'u1', name: 'Ada', email: 'ada@test.com' },
    ]);
    const service = new AuditService(prisma as never);
    const result = await service.list();
    expect(result).toEqual([
      {
        id: 'a1',
        userId: 'u1',
        userName: 'Ada',
        userEmail: 'ada@test.com',
        action: 'CREATE',
        entity: 'Dashboard',
        entityId: 'd1',
        meta: null,
        createdAt: new Date('2026-08-22T00:00:00.000Z'),
      },
    ]);
  });

  it('list: eslesen kullanici bulunamazsa tire ile doner', async () => {
    const prisma = createPrisma();
    prisma.auditLog.findMany.mockResolvedValue([
      {
        id: 'a1',
        userId: 'silinmis-kullanici',
        action: 'DELETE',
        entity: 'Widget',
        entityId: 'w1',
        meta: null,
        createdAt: new Date('2026-08-22T00:00:00.000Z'),
      },
    ]);
    const service = new AuditService(prisma as never);
    const result = await service.list();
    expect(result[0].userName).toBe('—');
    expect(result[0].userEmail).toBe('—');
  });
});
