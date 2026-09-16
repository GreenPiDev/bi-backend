import { Prisma } from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import { DepartmentOptionsService } from './department-options.service';

const fakeAudit = { log: vi.fn() };

function createPrisma() {
  return {
    departmentOption: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      delete: vi.fn(),
    },
  };
}

describe('DepartmentOptionsService', () => {
  it('create: ayni etiket zaten varsa DEPARTMENT_ALREADY_EXISTS firlatir', async () => {
    const prisma = createPrisma();
    prisma.departmentOption.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    const service = new DepartmentOptionsService(
      prisma as never,
      fakeAudit as never,
    );
    await expect(service.create({ label: 'Muhasebe' })).rejects.toMatchObject({
      code: 'DEPARTMENT_ALREADY_EXISTS',
    } satisfies Partial<AppException>);
  });

  it('remove: bulunamayan sektor icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma();
    const service = new DepartmentOptionsService(
      prisma as never,
      fakeAudit as never,
    );
    await expect(service.remove('yok')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<AppException>);
  });

  it('create: basarili olursa audit loglar', async () => {
    const prisma = createPrisma();
    prisma.departmentOption.create.mockResolvedValue({
      id: 's1',
      label: 'Muhasebe',
    });
    const service = new DepartmentOptionsService(
      prisma as never,
      fakeAudit as never,
    );
    const result = await service.create({ label: 'Muhasebe' });
    expect(result.label).toBe('Muhasebe');
    expect(fakeAudit.log).toHaveBeenCalled();
  });
});
