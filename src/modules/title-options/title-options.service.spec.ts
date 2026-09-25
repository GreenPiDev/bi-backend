import { Prisma } from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import { TenantContext } from '../../core/tenant/tenant-context';
import { TitleOptionsService } from './title-options.service';

const fakeAudit = { log: vi.fn() };
const fakeRealtime = { emitToTenant: vi.fn(), emitToAll: vi.fn() };

function createPrisma() {
  return {
    titleOption: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      delete: vi.fn(),
    },
  };
}

function runInTenant<T>(fn: () => Promise<T>): Promise<T> {
  return TenantContext.run({ tenantId: 't1', userId: 'u1', roleIds: [] }, fn);
}

describe('TitleOptionsService', () => {
  it('create: ayni etiket zaten varsa TITLE_ALREADY_EXISTS firlatir', async () => {
    const prisma = createPrisma();
    prisma.titleOption.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    const service = new TitleOptionsService(
      prisma as never,
      fakeAudit as never,
      fakeRealtime as never,
    );
    await expect(
      runInTenant(() => service.create({ label: 'Satis Muduru' })),
    ).rejects.toMatchObject({
      code: 'TITLE_ALREADY_EXISTS',
    } satisfies Partial<AppException>);
  });

  it('remove: bulunamayan unvan icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma();
    const service = new TitleOptionsService(
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
    prisma.titleOption.create.mockResolvedValue({
      id: 's1',
      label: 'Satis Muduru',
    });
    const service = new TitleOptionsService(
      prisma as never,
      fakeAudit as never,
      fakeRealtime as never,
    );
    const result = await runInTenant(() =>
      service.create({ label: 'Satis Muduru' }),
    );
    expect(result.label).toBe('Satis Muduru');
    expect(fakeAudit.log).toHaveBeenCalled();
    expect(fakeRealtime.emitToTenant).toHaveBeenCalledWith(
      't1',
      'titleOptions.updated',
      expect.any(Array),
    );
  });
});
