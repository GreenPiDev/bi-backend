import { Prisma } from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import { TenantContext } from '../../core/tenant/tenant-context';
import { QuoteRejectionReasonOptionsService } from './quote-rejection-reason-options.service';

const fakeAudit = { log: vi.fn() };
const fakeRealtime = { emitToTenant: vi.fn(), emitToAll: vi.fn() };

function createPrisma() {
  return {
    quoteRejectionReasonOption: {
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

describe('QuoteRejectionReasonOptionsService', () => {
  it('create: ayni etiket zaten varsa QUOTE_REJECTION_REASON_ALREADY_EXISTS firlatir', async () => {
    const prisma = createPrisma();
    prisma.quoteRejectionReasonOption.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    const service = new QuoteRejectionReasonOptionsService(
      prisma as never,
      fakeAudit as never,
      fakeRealtime as never,
    );
    await expect(
      runInTenant(() => service.create({ label: 'Yuksek Fiyat' })),
    ).rejects.toMatchObject({
      code: 'QUOTE_REJECTION_REASON_ALREADY_EXISTS',
    } satisfies Partial<AppException>);
  });

  it('update: bulunamayan sebep icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma();
    const service = new QuoteRejectionReasonOptionsService(
      prisma as never,
      fakeAudit as never,
      fakeRealtime as never,
    );
    await expect(
      runInTenant(() => service.update('yok', { label: 'Yuksek Fiyat' })),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<AppException>);
  });

  it('update: basarili olursa audit loglar ve tenant odasina yayinlar', async () => {
    const prisma = createPrisma();
    prisma.quoteRejectionReasonOption.findFirst.mockResolvedValue({
      id: 'p1',
      label: 'Yuksek Fiyat',
    });
    prisma.quoteRejectionReasonOption.update.mockResolvedValue({
      id: 'p1',
      label: 'Butce Yetersiz',
    });
    const service = new QuoteRejectionReasonOptionsService(
      prisma as never,
      fakeAudit as never,
      fakeRealtime as never,
    );
    const result = await runInTenant(() =>
      service.update('p1', { label: 'Butce Yetersiz' }),
    );
    expect(result.label).toBe('Butce Yetersiz');
    expect(fakeAudit.log).toHaveBeenCalled();
    expect(fakeRealtime.emitToTenant).toHaveBeenCalledWith(
      't1',
      'quoteRejectionReasonOptions.updated',
      expect.any(Array),
    );
  });

  it('remove: bulunamayan sebep icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma();
    const service = new QuoteRejectionReasonOptionsService(
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
    prisma.quoteRejectionReasonOption.create.mockResolvedValue({
      id: 'p1',
      label: 'Yuksek Fiyat',
    });
    const service = new QuoteRejectionReasonOptionsService(
      prisma as never,
      fakeAudit as never,
      fakeRealtime as never,
    );
    const result = await runInTenant(() =>
      service.create({ label: 'Yuksek Fiyat' }),
    );
    expect(result.label).toBe('Yuksek Fiyat');
    expect(fakeAudit.log).toHaveBeenCalled();
    expect(fakeRealtime.emitToTenant).toHaveBeenCalledWith(
      't1',
      'quoteRejectionReasonOptions.updated',
      expect.any(Array),
    );
  });
});
