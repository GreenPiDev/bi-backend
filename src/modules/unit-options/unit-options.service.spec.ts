import { Prisma } from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import { TenantContext } from '../../core/tenant/tenant-context';
import { UnitOptionsService } from './unit-options.service';

const fakeAudit = { log: vi.fn() };
const fakeRealtime = { emitToTenant: vi.fn(), emitToAll: vi.fn() };

function createPrisma() {
  return {
    unitOption: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
}

function runInTenant<T>(fn: () => Promise<T>): Promise<T> {
  return TenantContext.run({ tenantId: 't1', userId: 'u1', roleIds: [] }, fn);
}

describe('UnitOptionsService', () => {
  it('create: ayni etiket zaten varsa UNIT_ALREADY_EXISTS firlatir', async () => {
    const prisma = createPrisma();
    prisma.unitOption.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    const service = new UnitOptionsService(
      prisma as never,
      fakeAudit as never,
      fakeRealtime as never,
    );
    await expect(
      runInTenant(() => service.create({ label: 'adet' })),
    ).rejects.toMatchObject({
      code: 'UNIT_ALREADY_EXISTS',
    } satisfies Partial<AppException>);
  });

  it('update: bulunamayan birim icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma();
    const service = new UnitOptionsService(
      prisma as never,
      fakeAudit as never,
      fakeRealtime as never,
    );
    await expect(
      runInTenant(() => service.update('yok', { label: 'adet' })),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<AppException>);
  });

  it('update: basarili olursa audit loglar ve tenant odasina yayinlar', async () => {
    const prisma = createPrisma();
    prisma.unitOption.findFirst.mockResolvedValue({ id: 'p1', label: 'adet' });
    prisma.unitOption.update.mockResolvedValue({
      id: 'p1',
      label: 'kutu',
    });
    const service = new UnitOptionsService(
      prisma as never,
      fakeAudit as never,
      fakeRealtime as never,
    );
    const result = await runInTenant(() =>
      service.update('p1', { label: 'kutu' }),
    );
    expect(result.label).toBe('kutu');
    expect(fakeAudit.log).toHaveBeenCalled();
    expect(fakeRealtime.emitToTenant).toHaveBeenCalledWith(
      't1',
      'unitOptions.updated',
      expect.any(Array),
    );
  });

  it('remove: bulunamayan birim icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma();
    const service = new UnitOptionsService(
      prisma as never,
      fakeAudit as never,
      fakeRealtime as never,
    );
    await expect(
      runInTenant(() => service.remove('yok')),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<AppException>);
  });

  it('create: basarili olursa audit loglar ve tenant odasina yayinlar', async () => {
    const prisma = createPrisma();
    prisma.unitOption.create.mockResolvedValue({ id: 'p1', label: 'adet' });
    const service = new UnitOptionsService(
      prisma as never,
      fakeAudit as never,
      fakeRealtime as never,
    );
    const result = await runInTenant(() => service.create({ label: 'adet' }));
    expect(result.label).toBe('adet');
    expect(fakeAudit.log).toHaveBeenCalled();
    expect(fakeRealtime.emitToTenant).toHaveBeenCalledWith(
      't1',
      'unitOptions.updated',
      expect.any(Array),
    );
  });
});
