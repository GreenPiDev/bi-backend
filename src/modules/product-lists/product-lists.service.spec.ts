import { AppException } from '../../core/errors/app.exception';
import { ProductListsService } from './product-lists.service';

const auditLog = vi.fn();
const fakeAudit = { log: auditLog } as never;

function createProductListRow(
  overrides: Partial<Record<string, unknown>> = {},
) {
  return {
    id: 'product-list-1',
    name: 'Genel',
    isDefault: true,
    ...overrides,
  };
}

function createPrisma(row: unknown = createProductListRow(), productCount = 0) {
  const prisma = {
    productList: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      findFirst: vi.fn().mockResolvedValue(row),
      create: vi.fn().mockResolvedValue(row),
      update: vi.fn().mockResolvedValue(row),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      delete: vi.fn().mockResolvedValue(row),
    },
    product: {
      count: vi.fn().mockResolvedValue(productCount),
    },
    $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
  };
  return prisma;
}

describe('ProductListsService', () => {
  it('getById: bulunamayan urun listesi icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma(null);
    const service = new ProductListsService(prisma as never, fakeAudit);
    await expect(service.getById('yok')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<AppException>);
  });

  it('create: urun listesini olusturur ve audit log yazar', async () => {
    const prisma = createPrisma();
    const service = new ProductListsService(prisma as never, fakeAudit);
    await service.create({ name: 'Bayi Katalogu', isDefault: false });
    expect(prisma.productList.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { name: 'Bayi Katalogu', isDefault: false },
      }),
    );
    expect(auditLog).toHaveBeenCalled();
  });

  it('create: varsayilan olarak isaretlenirse digerlerinin varsayilan bayragini kaldirir', async () => {
    const prisma = createPrisma();
    const service = new ProductListsService(prisma as never, fakeAudit);
    await service.create({ name: 'Bayi Katalogu', isDefault: true });
    expect(prisma.productList.updateMany).toHaveBeenCalledWith({
      where: { isDefault: true },
      data: { isDefault: false },
    });
    expect(prisma.productList.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { name: 'Bayi Katalogu', isDefault: true },
      }),
    );
  });

  it('create: varsayilan degilse digerlerine dokunmaz', async () => {
    const prisma = createPrisma();
    const service = new ProductListsService(prisma as never, fakeAudit);
    await service.create({ name: 'Bayi Katalogu', isDefault: false });
    expect(prisma.productList.updateMany).not.toHaveBeenCalled();
  });

  it('update: varsayilan olarak isaretlenirse digerlerinin (kendisi haric) varsayilan bayragini kaldirir', async () => {
    const prisma = createPrisma();
    const service = new ProductListsService(prisma as never, fakeAudit);
    await service.update('product-list-1', { isDefault: true });
    expect(prisma.productList.updateMany).toHaveBeenCalledWith({
      where: { isDefault: true, id: { not: 'product-list-1' } },
      data: { isDefault: false },
    });
  });

  it('update: bulunamayan urun listesi icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma(null);
    const service = new ProductListsService(prisma as never, fakeAudit);
    await expect(
      service.update('yok', { name: 'Yeni Ad' }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('remove: bulunamayan urun listesi icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma(null);
    const service = new ProductListsService(prisma as never, fakeAudit);
    await expect(service.remove('yok')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('remove: icinde urun varsa PRODUCT_LIST_NOT_EMPTY firlatir ve silmez', async () => {
    const prisma = createPrisma(createProductListRow(), 3);
    const service = new ProductListsService(prisma as never, fakeAudit);
    await expect(service.remove('product-list-1')).rejects.toMatchObject({
      code: 'PRODUCT_LIST_NOT_EMPTY',
    });
    expect(prisma.productList.delete).not.toHaveBeenCalled();
  });

  it('remove: liste bossa siler ve audit log yazar', async () => {
    const prisma = createPrisma(createProductListRow(), 0);
    const service = new ProductListsService(prisma as never, fakeAudit);
    await service.remove('product-list-1');
    expect(prisma.productList.delete).toHaveBeenCalledWith({
      where: { id: 'product-list-1' },
    });
    expect(auditLog).toHaveBeenCalled();
  });
});
