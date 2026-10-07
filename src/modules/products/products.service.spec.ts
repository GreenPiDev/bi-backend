import { AppException } from '../../core/errors/app.exception';
import { TenantContext } from '../../core/tenant/tenant-context';
import { ProductsService } from './products.service';

function runInTenant<T>(fn: () => Promise<T>): Promise<T> {
  return TenantContext.run({ tenantId: 't1', userId: 'u1', roleIds: [] }, fn);
}

const auditLog = vi.fn();
const fakeAudit = { log: auditLog } as never;
const fakeCache = {
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn(),
  invalidate: vi.fn(),
} as never;
const fakePriceHistoryCache = {
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
  findManyRows: unknown[] = [],
) {
  return {
    product: {
      findMany: vi.fn().mockResolvedValue(findManyRows),
      count: vi.fn().mockResolvedValue(0),
      findFirst: vi.fn().mockResolvedValue(row),
      create: vi.fn().mockResolvedValue(row),
      update: vi.fn().mockResolvedValue(row),
      updateMany: vi.fn().mockResolvedValue({ count: 2 }),
      delete: vi.fn().mockResolvedValue(row),
      deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
    },
    productList: {
      findFirst: vi.fn().mockResolvedValue(targetProductList),
    },
    productDrawingSpec: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      upsert: vi.fn().mockImplementation(({ create }) => create),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
  };
}

describe('ProductsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getById: bulunamayan urun icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma(null);
    const service = new ProductsService(
      prisma as never,
      prisma as never,
      fakeAudit,
      fakeCache,
      fakePriceHistoryCache,
    );
    await expect(service.getById('yok')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<AppException>);
  });

  it('create: urunu olusturur ve audit log yazar', async () => {
    const prisma = createPrisma();
    const service = new ProductsService(
      prisma as never,
      prisma as never,
      fakeAudit,
      fakeCache,
      fakePriceHistoryCache,
    );
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
    const service = new ProductsService(
      prisma as never,
      prisma as never,
      fakeAudit,
      fakeCache,
      fakePriceHistoryCache,
    );
    await expect(
      service.update('yok', { name: 'x' } as never),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('remove: urunu siler ve audit log yazar', async () => {
    const prisma = createPrisma();
    const service = new ProductsService(
      prisma as never,
      prisma as never,
      fakeAudit,
      fakeCache,
      fakePriceHistoryCache,
    );
    await service.remove('product-1');
    expect(prisma.product.delete).toHaveBeenCalledWith({
      where: { id: 'product-1' },
    });
  });

  it('bulkMove: bulunamayan hedef liste icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma(createProductRow(), null);
    const service = new ProductsService(
      prisma as never,
      prisma as never,
      fakeAudit,
      fakeCache,
      fakePriceHistoryCache,
    );
    await expect(
      service.bulkMove({
        productIds: ['product-1'],
        targetProductListId: 'yok',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(prisma.product.updateMany).not.toHaveBeenCalled();
  });

  it('list: brand/category/attr filtrelerini where kosuluna ekler', async () => {
    const prisma = createPrisma();
    const service = new ProductsService(
      prisma as never,
      prisma as never,
      fakeAudit,
      fakeCache,
      fakePriceHistoryCache,
    );
    await service.list({
      page: 1,
      pageSize: 25,
      brand: 'Schneider',
      category: 'Sayac',
      attr: { Seri: 'kWH' },
    } as never);
    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          brand: 'Schneider',
          category: 'Sayac',
          AND: [
            {
              attributes: {
                path: ['Seri'],
                string_contains: 'kWH',
                mode: 'insensitive',
              },
            },
          ],
        }),
      }),
    );
  });

  it('getAttributeKeys: tenant genelindeki distinct ozel alan adlarini doner', async () => {
    const prisma = createPrisma();
    prisma.$queryRaw.mockResolvedValue([{ key: 'Renk' }, { key: 'Seri' }]);
    const service = new ProductsService(
      prisma as never,
      prisma as never,
      fakeAudit,
      fakeCache,
      fakePriceHistoryCache,
    );
    const result = await runInTenant(() => service.getAttributeKeys());
    expect(result).toEqual(['Renk', 'Seri']);
    expect(prisma.$queryRaw).toHaveBeenCalled();
  });

  it('bulkMove: secilen urunleri hedef listeye tasir', async () => {
    const prisma = createPrisma();
    const service = new ProductsService(
      prisma as never,
      prisma as never,
      fakeAudit,
      fakeCache,
      fakePriceHistoryCache,
    );
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

  it('bulkRemove: secilen urunleri yumusak siler ve audit log yazar', async () => {
    const prisma = createPrisma();
    const service = new ProductsService(
      prisma as never,
      prisma as never,
      fakeAudit,
      fakeCache,
      fakePriceHistoryCache,
    );
    const result = await service.bulkRemove({
      productIds: ['product-1', 'product-2'],
    });
    expect(prisma.product.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['product-1', 'product-2'] } },
    });
    expect(result).toEqual({ deletedCount: 2 });
    expect(auditLog).toHaveBeenCalled();
  });

  it('list: includeDeleted=true iken tenantId elle eklenmis ham client kullanir (deletedAt filtresi atlanir)', async () => {
    const prisma = createPrisma();
    const service = new ProductsService(
      prisma as never,
      prisma as never,
      fakeAudit,
      fakeCache,
      fakePriceHistoryCache,
    );
    await runInTenant(() =>
      service.list({
        page: 1,
        pageSize: 25,
        includeDeleted: true,
      } as never),
    );
    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 't1' }),
      }),
    );
  });

  it('list: includeDeleted=false iken tenant-scoped client kullanir, where.tenantId elle eklenmez', async () => {
    const prisma = createPrisma();
    const service = new ProductsService(
      prisma as never,
      prisma as never,
      fakeAudit,
      fakeCache,
      fakePriceHistoryCache,
    );
    await service.list({
      page: 1,
      pageSize: 25,
      includeDeleted: false,
    } as never);
    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({ tenantId: expect.anything() }),
      }),
    );
  });

  it('list: stockItems kaydi olan urun icin gercek stockQuantity doner', async () => {
    const rowWithStock = createProductRow({
      stockItems: [{ quantity: '12.5' }],
    });
    const prisma = createPrisma(undefined, undefined, [rowWithStock]);
    const service = new ProductsService(
      prisma as never,
      prisma as never,
      fakeAudit,
      fakeCache,
      fakePriceHistoryCache,
    );
    const result = await service.list({ page: 1, pageSize: 25 } as never);
    expect(result.data[0].stockQuantity.toString()).toBe('12.5');
    expect(result.data[0]).not.toHaveProperty('stockItems');
  });

  it('list: birden fazla depodaki stockItems kayitlarini toplar (cok depolu stok)', async () => {
    const rowWithStock = createProductRow({
      stockItems: [{ quantity: '12.5' }, { quantity: '7.5' }],
    });
    const prisma = createPrisma(undefined, undefined, [rowWithStock]);
    const service = new ProductsService(
      prisma as never,
      prisma as never,
      fakeAudit,
      fakeCache,
      fakePriceHistoryCache,
    );
    const result = await service.list({ page: 1, pageSize: 25 } as never);
    expect(result.data[0].stockQuantity.toString()).toBe('20');
  });

  it('list: sort=stockQuantity:asc, stok miktarina gore kucukten buyuge siralar', async () => {
    const rowLow = createProductRow({
      id: 'p-low',
      stockItems: [{ quantity: '2' }],
    });
    const rowHigh = createProductRow({
      id: 'p-high',
      stockItems: [{ quantity: '20' }],
    });
    const prisma = createPrisma(undefined, undefined, [rowHigh, rowLow]);
    const service = new ProductsService(
      prisma as never,
      prisma as never,
      fakeAudit,
      fakeCache,
      fakePriceHistoryCache,
    );
    const result = await service.list({
      page: 1,
      pageSize: 25,
      sort: 'stockQuantity:asc',
    } as never);
    expect(result.data.map((p) => p.id)).toEqual(['p-low', 'p-high']);
  });

  it('list: sort=stockQuantity:desc, stok miktarina gore buyukten kucuge siralar', async () => {
    const rowLow = createProductRow({
      id: 'p-low',
      stockItems: [{ quantity: '2' }],
    });
    const rowHigh = createProductRow({
      id: 'p-high',
      stockItems: [{ quantity: '20' }],
    });
    const prisma = createPrisma(undefined, undefined, [rowLow, rowHigh]);
    const service = new ProductsService(
      prisma as never,
      prisma as never,
      fakeAudit,
      fakeCache,
      fakePriceHistoryCache,
    );
    const result = await service.list({
      page: 1,
      pageSize: 25,
      sort: 'stockQuantity:desc',
    } as never);
    expect(result.data.map((p) => p.id)).toEqual(['p-high', 'p-low']);
  });

  it('list: hic StockItem kaydi olmayan urun icin stockQuantity 0 doner', async () => {
    const rowWithoutStock = createProductRow({ stockItems: [] });
    const prisma = createPrisma(undefined, undefined, [rowWithoutStock]);
    const service = new ProductsService(
      prisma as never,
      prisma as never,
      fakeAudit,
      fakeCache,
      fakePriceHistoryCache,
    );
    const result = await service.list({ page: 1, pageSize: 25 } as never);
    expect(String(result.data[0].stockQuantity)).toBe('0');
  });

  it('create: drawingSpec verilmezse ProductDrawingSpec hic yaratilmaz', async () => {
    const prisma = createPrisma();
    const service = new ProductsService(
      prisma as never,
      prisma as never,
      fakeAudit,
      fakeCache,
      fakePriceHistoryCache,
    );
    const result = await service.create({
      name: 'Kesici 2500A',
      unit: 'adet',
    } as never);
    expect(prisma.productDrawingSpec.upsert).not.toHaveBeenCalled();
    expect(result.drawingSpec).toBeNull();
  });

  it('create: drawingSpec dolu gelirse ProductDrawingSpec upsert edilir', async () => {
    const prisma = createPrisma();
    const service = new ProductsService(
      prisma as never,
      prisma as never,
      fakeAudit,
      fakeCache,
      fakePriceHistoryCache,
    );
    await service.create({
      name: 'Kesici 2500A',
      unit: 'adet',
      drawingSpec: { widthMm: 400, heightMm: 300 },
    } as never);
    expect(prisma.productDrawingSpec.upsert).toHaveBeenCalledWith({
      where: { productId: 'product-1' },
      create: { productId: 'product-1', widthMm: 400, heightMm: 300 },
      update: { widthMm: 400, heightMm: 300 },
    });
  });

  it('update: drawingSpec gonderilmezse mevcut deger degismeden doner', async () => {
    const rowWithSpec = createProductRow({
      drawingSpec: { id: 'spec-1', productId: 'product-1', widthMm: '400' },
    });
    const prisma = createPrisma(rowWithSpec);
    const service = new ProductsService(
      prisma as never,
      prisma as never,
      fakeAudit,
      fakeCache,
      fakePriceHistoryCache,
    );
    const result = await service.update('product-1', { name: 'x' } as never);
    expect(prisma.productDrawingSpec.upsert).not.toHaveBeenCalled();
    expect(prisma.productDrawingSpec.deleteMany).not.toHaveBeenCalled();
    expect(result.drawingSpec).toEqual(
      (rowWithSpec as Record<string, unknown>).drawingSpec,
    );
  });

  it('update: drawingSpec tum alanlari bos/null gelirse spec silinir', async () => {
    const prisma = createPrisma();
    const service = new ProductsService(
      prisma as never,
      prisma as never,
      fakeAudit,
      fakeCache,
      fakePriceHistoryCache,
    );
    const result = await service.update('product-1', {
      drawingSpec: { widthMm: null, heightMm: null },
    } as never);
    expect(prisma.productDrawingSpec.deleteMany).toHaveBeenCalledWith({
      where: { productId: 'product-1' },
    });
    expect(result.drawingSpec).toBeNull();
  });
});
