import { Prisma } from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import { SectorOptionsService } from './sector-options.service';

const fakeAudit = { log: vi.fn() };

function createPrisma() {
  return {
    sectorOption: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      delete: vi.fn(),
    },
  };
}

describe('SectorOptionsService', () => {
  it('create: ayni etiket zaten varsa SECTOR_ALREADY_EXISTS firlatir', async () => {
    const prisma = createPrisma();
    prisma.sectorOption.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    const service = new SectorOptionsService(
      prisma as never,
      fakeAudit as never,
    );
    await expect(service.create({ label: 'Yazilim' })).rejects.toMatchObject({
      code: 'SECTOR_ALREADY_EXISTS',
    } satisfies Partial<AppException>);
  });

  it('remove: bulunamayan sektor icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma();
    const service = new SectorOptionsService(
      prisma as never,
      fakeAudit as never,
    );
    await expect(service.remove('yok')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<AppException>);
  });

  it('create: basarili olursa audit loglar', async () => {
    const prisma = createPrisma();
    prisma.sectorOption.create.mockResolvedValue({
      id: 's1',
      label: 'Yazilim',
    });
    const service = new SectorOptionsService(
      prisma as never,
      fakeAudit as never,
    );
    const result = await service.create({ label: 'Yazilim' });
    expect(result.label).toBe('Yazilim');
    expect(fakeAudit.log).toHaveBeenCalled();
  });
});
