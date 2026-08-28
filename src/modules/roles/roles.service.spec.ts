import { Prisma } from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import { RolesService } from './roles.service';

const fakeAudit = { log: vi.fn() };
const fakePermissions = { invalidateRole: vi.fn() };

function createPrisma() {
  return {
    role: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
    },
  };
}

function createRawPrisma(txOverrides: Record<string, unknown> = {}) {
  const tx = {
    role: { update: vi.fn(), delete: vi.fn() },
    rolePermission: { deleteMany: vi.fn(), createMany: vi.fn() },
    userRoleLink: { count: vi.fn().mockResolvedValue(1), create: vi.fn() },
    ...txOverrides,
  };
  return {
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
    _tx: tx,
  };
}

describe('RolesService', () => {
  it('create: bilinmeyen sayfa anahtari icin UNKNOWN_PAGE firlatir', async () => {
    const prisma = createPrisma();
    const rawPrisma = createRawPrisma();
    const service = new RolesService(
      prisma as never,
      rawPrisma as never,
      fakePermissions as never,
      fakeAudit as never,
    );
    await expect(
      service.create({
        name: 'Satis Muduru',
        permissions: [{ pageKey: 'olmayan-sayfa', actions: ['VIEW'] }],
      }),
    ).rejects.toMatchObject({
      code: 'UNKNOWN_PAGE',
    } satisfies Partial<AppException>);
  });

  it('create: ayni isimde rol varsa ROLE_ALREADY_EXISTS firlatir', async () => {
    const prisma = createPrisma();
    prisma.role.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    const rawPrisma = createRawPrisma();
    const service = new RolesService(
      prisma as never,
      rawPrisma as never,
      fakePermissions as never,
      fakeAudit as never,
    );
    await expect(
      service.create({ name: 'Satis Muduru', permissions: [] }),
    ).rejects.toMatchObject({
      code: 'ROLE_ALREADY_EXISTS',
    } satisfies Partial<AppException>);
  });

  it('create: gecerli girdide rol olusturur ve audit loglar', async () => {
    const prisma = createPrisma();
    prisma.role.create.mockResolvedValue({
      id: 'r1',
      name: 'Satis Muduru',
      isSystem: false,
      isBasic: false,
      isCompanyAdmin: false,
      permissions: [{ pageKey: 'accounts', tabKey: null, action: 'VIEW' }],
      users: [],
    });
    const rawPrisma = createRawPrisma();
    const service = new RolesService(
      prisma as never,
      rawPrisma as never,
      fakePermissions as never,
      fakeAudit as never,
    );
    const result = await service.create({
      name: 'Satis Muduru',
      permissions: [{ pageKey: 'accounts', actions: ['VIEW'] }],
    });
    expect(result.name).toBe('Satis Muduru');
    expect(fakeAudit.log).toHaveBeenCalled();
  });

  it('update: sistem rolu duzenlenmek istenirse SYSTEM_ROLE_READONLY firlatir', async () => {
    const prisma = createPrisma();
    prisma.role.findFirst.mockResolvedValue({
      id: 'r1',
      tenantId: 't1',
      isSystem: true,
    });
    const rawPrisma = createRawPrisma();
    const service = new RolesService(
      prisma as never,
      rawPrisma as never,
      fakePermissions as never,
      fakeAudit as never,
    );
    await expect(
      service.update('r1', { name: 'Yeni Isim' }),
    ).rejects.toMatchObject({
      code: 'SYSTEM_ROLE_READONLY',
    } satisfies Partial<AppException>);
  });

  it('remove: sistem rolu silinmek istenirse SYSTEM_ROLE_READONLY firlatir', async () => {
    const prisma = createPrisma();
    prisma.role.findFirst.mockResolvedValue({
      id: 'r1',
      tenantId: 't1',
      isSystem: true,
      users: [],
    });
    const rawPrisma = createRawPrisma();
    const service = new RolesService(
      prisma as never,
      rawPrisma as never,
      fakePermissions as never,
      fakeAudit as never,
    );
    await expect(service.remove('r1')).rejects.toMatchObject({
      code: 'SYSTEM_ROLE_READONLY',
    } satisfies Partial<AppException>);
  });

  it('remove: bulunamayan rol icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma();
    const rawPrisma = createRawPrisma();
    const service = new RolesService(
      prisma as never,
      rawPrisma as never,
      fakePermissions as never,
      fakeAudit as never,
    );
    await expect(service.remove('yok')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<AppException>);
  });

  it('remove: rolu silinen ve baska rolu kalmayan kullanicilar BASIC role tasinir', async () => {
    const prisma = createPrisma();
    prisma.role.findFirst
      .mockResolvedValueOnce({
        id: 'r1',
        tenantId: 't1',
        isSystem: false,
        users: [{ userId: 'u1' }],
      })
      .mockResolvedValueOnce({
        id: 'basic-role',
        tenantId: 't1',
        isBasic: true,
      });
    const rawPrisma = createRawPrisma({
      userRoleLink: { count: vi.fn().mockResolvedValue(0), create: vi.fn() },
    });
    const service = new RolesService(
      prisma as never,
      rawPrisma as never,
      fakePermissions as never,
      fakeAudit as never,
    );
    await service.remove('r1');
    expect(rawPrisma._tx.role.delete).toHaveBeenCalledWith({
      where: { id: 'r1' },
    });
    expect(rawPrisma._tx.userRoleLink.create).toHaveBeenCalledWith({
      data: { userId: 'u1', roleId: 'basic-role' },
    });
    expect(fakePermissions.invalidateRole).toHaveBeenCalledWith('t1', 'r1');
  });
});
