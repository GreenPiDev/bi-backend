import { Prisma } from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import { TenantContext } from '../../core/tenant/tenant-context';
import { BrandOptionsService } from './brand-options.service';

const fakeAudit = { log: vi.fn() };
const fakeRealtime = { emitToTenant: vi.fn(), emitToAll: vi.fn() };

function createPrisma() {
  return {
    brandOption: {
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

describe('BrandOptionsService', () => {
  it('create: ayni etiket zaten varsa BRAND_ALREADY_EXISTS firlatir', async () => {
    const prisma = createPrisma();
    prisma.brandOption.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    const service = new BrandOptionsService(
      prisma as never,
      fakeAudit as never,
      fakeRealtime as never,
    );
    await expect(
      runInTenant(() => service.create({ label: 'ABB' })),
    ).rejects.toMatchObject({
      code: 'BRAND_ALREADY_EXISTS',
    } satisfies Partial<AppException>);
  });

  it('update: bulunamayan marka icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma();
    const service = new BrandOptionsService(
      prisma as never,
      fakeAudit as never,
      fakeRealtime as never,
    );
    await expect(
      runInTenant(() => service.update('yok', { label: 'ABB' })),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<AppException>);
  });

  it('update: basarili olursa audit loglar ve tenant odasina yayinlar', async () => {
    const prisma = createPrisma();
    prisma.brandOption.findFirst.mockResolvedValue({ id: 'p1', label: 'ABB' });
    prisma.brandOption.update.mockResolvedValue({
      id: 'p1',
      label: 'Schneider',
    });
    const service = new BrandOptionsService(
      prisma as never,
      fakeAudit as never,
      fakeRealtime as never,
    );
    const result = await runInTenant(() =>
      service.update('p1', { label: 'Schneider' }),
    );
    expect(result.label).toBe('Schneider');
    expect(fakeAudit.log).toHaveBeenCalled();
    expect(fakeRealtime.emitToTenant).toHaveBeenCalledWith(
      't1',
      'brandOptions.updated',
      expect.any(Array),
    );
  });

  it('remove: bulunamayan marka icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma();
    const service = new BrandOptionsService(
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
    prisma.brandOption.create.mockResolvedValue({ id: 'p1', label: 'ABB' });
    const service = new BrandOptionsService(
      prisma as never,
      fakeAudit as never,
      fakeRealtime as never,
    );
    const result = await runInTenant(() => service.create({ label: 'ABB' }));
    expect(result.label).toBe('ABB');
    expect(fakeAudit.log).toHaveBeenCalled();
    expect(fakeRealtime.emitToTenant).toHaveBeenCalledWith(
      't1',
      'brandOptions.updated',
      expect.any(Array),
    );
  });
});
