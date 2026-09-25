import { Prisma } from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import { ProductCategoriesService } from './product-categories.service';

const fakeAudit = { log: vi.fn() };

function createPrisma() {
  return {
    productCategoryOption: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
}

describe('ProductCategoriesService', () => {
  it('create: ayni etiket zaten varsa PRODUCT_CATEGORY_ALREADY_EXISTS firlatir', async () => {
    const prisma = createPrisma();
    prisma.productCategoryOption.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    const service = new ProductCategoriesService(
      prisma as never,
      fakeAudit as never,
    );
    await expect(service.create({ label: 'Elektrik' })).rejects.toMatchObject({
      code: 'PRODUCT_CATEGORY_ALREADY_EXISTS',
    } satisfies Partial<AppException>);
  });

  it('update: bulunamayan kategori icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma();
    const service = new ProductCategoriesService(
      prisma as never,
      fakeAudit as never,
    );
    await expect(
      service.update('yok', { label: 'Elektrik' }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<AppException>);
  });

  it('update: basarili olursa audit loglar', async () => {
    const prisma = createPrisma();
    prisma.productCategoryOption.findFirst.mockResolvedValue({
      id: 'p1',
      label: 'Elektrik',
    });
    prisma.productCategoryOption.update.mockResolvedValue({
      id: 'p1',
      label: 'Elektronik',
    });
    const service = new ProductCategoriesService(
      prisma as never,
      fakeAudit as never,
    );
    const result = await service.update('p1', { label: 'Elektronik' });
    expect(result.label).toBe('Elektronik');
    expect(fakeAudit.log).toHaveBeenCalled();
  });

  it('remove: bulunamayan kategori icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma();
    const service = new ProductCategoriesService(
      prisma as never,
      fakeAudit as never,
    );
    await expect(service.remove('yok')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<AppException>);
  });

  it('create: basarili olursa audit loglar', async () => {
    const prisma = createPrisma();
    prisma.productCategoryOption.create.mockResolvedValue({
      id: 'p1',
      label: 'Elektrik',
    });
    const service = new ProductCategoriesService(
      prisma as never,
      fakeAudit as never,
    );
    const result = await service.create({ label: 'Elektrik' });
    expect(result.label).toBe('Elektrik');
    expect(fakeAudit.log).toHaveBeenCalled();
  });
});
