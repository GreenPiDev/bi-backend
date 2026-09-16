import { Prisma } from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import { TitleOptionsService } from './title-options.service';

const fakeAudit = { log: vi.fn() };

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
    );
    await expect(service.create({ label: 'Muhendis' })).rejects.toMatchObject({
      code: 'TITLE_ALREADY_EXISTS',
    } satisfies Partial<AppException>);
  });

  it('remove: bulunamayan sektor icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma();
    const service = new TitleOptionsService(
      prisma as never,
      fakeAudit as never,
    );
    await expect(service.remove('yok')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<AppException>);
  });

  it('create: basarili olursa audit loglar', async () => {
    const prisma = createPrisma();
    prisma.titleOption.create.mockResolvedValue({
      id: 's1',
      label: 'Muhendis',
    });
    const service = new TitleOptionsService(
      prisma as never,
      fakeAudit as never,
    );
    const result = await service.create({ label: 'Muhendis' });
    expect(result.label).toBe('Muhendis');
    expect(fakeAudit.log).toHaveBeenCalled();
  });
});
