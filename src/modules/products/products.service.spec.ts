import { AppException } from '../../core/errors/app.exception';
import { ProductsService } from './products.service';

const auditLog = vi.fn();
const fakeAudit = { log: auditLog } as never;
const fakeCache = {
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn(),
  invalidate: vi.fn(),
} as never;

function createProductRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'product-1',
    productListId: 'product-list-1',
    productList: { id: 'product-list-1', name: 'Genel' },
    name: 'Dizustu Bilgisayar',
    sku: 'SKU-1',
    unit: 'adet',
    ...overrides,
  };
}

function createPrisma(
  row: unknown = createProductRow(),
  targetProductList: unknown = { id: 'product-list-2', name: 'Bayi' },
) {
  return {
    product: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      findFirst: vi.fn().mockResolvedValue(row),
      create: vi.fn().mockResolvedValue(row),
      update: vi.fn().mockResolvedValue(row),
      updateMany: vi.fn().mockResolvedValue({ count: 2 }),
      delete: vi.fn().mockResolvedValue(row),
    },
    productList: {
      findFirst: vi.fn().mockResolvedValue(targetProductList),
    },
  };
}

describe('ProductsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getById: bulunamayan urun icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma(null);
    const service = new ProductsService(prisma as never, fakeAudit, fakeCache);
    await expect(service.getById('yok')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<AppException>);
  });

  it('create: urunu olusturur ve audit log yazar', async () => {
    const prisma = createPrisma();
    const service = new ProductsService(prisma as never, fakeAudit, fakeCache);
    await service.create({
      name: 'Dizustu Bilgisayar',
      unit: 'adet',
    } as never);
    expect(prisma.product.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'Dizustu Bilgisayar' }),
      }),
    );
    expect(auditLog).toHaveBeenCalled();
  });

  it('update: bulunamayan urun icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma(null);
    const service = new ProductsService(prisma as never, fakeAudit, fakeCache);
    await expect(
      service.update('yok', { name: 'x' } as never),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('remove: urunu siler ve audit log yazar', async () => {
    const prisma = createPrisma();
    const service = new ProductsService(prisma as never, fakeAudit, fakeCache);
    await service.remove('product-1');
    expect(prisma.product.delete).toHaveBeenCalledWith({
      where: { id: 'product-1' },
    });
  });

  it('bulkMove: bulunamayan hedef liste icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma(createProductRow(), null);
    const service = new ProductsService(prisma as never, fakeAudit, fakeCache);
    await expect(
      service.bulkMove({
        productIds: ['product-1'],
        targetProductListId: 'yok',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(prisma.product.updateMany).not.toHaveBeenCalled();
  });

  it('bulkMove: secilen urunleri hedef listeye tasir', async () => {
    const prisma = createPrisma();
    const service = new ProductsService(prisma as never, fakeAudit, fakeCache);
    const result = await service.bulkMove({
      productIds: ['product-1', 'product-2'],
      targetProductListId: 'product-list-2',
    });
    expect(prisma.product.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['product-1', 'product-2'] } },
      data: { productListId: 'product-list-2' },
    });
    expect(result).toEqual({ movedCount: 2 });
    expect(auditLog).toHaveBeenCalled();
  });
});
