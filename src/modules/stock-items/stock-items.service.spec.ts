import { AppException } from '../../core/errors/app.exception';
import { StockItemsService } from './stock-items.service';

const auditLog = vi.fn();
const auditList = vi.fn();
const fakeAudit = { log: auditLog, list: auditList } as never;
const productsCacheInvalidate = vi.fn();
const fakeProductsCache = { invalidate: productsCacheInvalidate } as never;

function createProductRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'product-1',
    name: 'Sunucu',
    minStockLevel: 5,
    createdAt: new Date('2026-01-01'),
    stockItems: [],
    ...overrides,
  };
}

function stockItem(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'stock-1',
    productId: 'product-1',
    warehouseId: 'warehouse-1',
    warehouse: { id: 'warehouse-1', name: 'Ana Depo' },
    quantity: '0',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

interface Setup {
  products?: unknown[];
  productRow?: unknown;
  warehouseRow?: unknown;
  existingStockItem?: unknown;
  createdStockItem?: unknown;
  updatedStockItem?: unknown;
  refreshedProductRow?: unknown;
}

function createPrisma({
  products = [],
  productRow = { id: 'product-1', name: 'Sunucu', minStockLevel: 5 },
  warehouseRow = { id: 'warehouse-1', name: 'Ana Depo' },
  existingStockItem = null,
  createdStockItem,
  updatedStockItem,
  refreshedProductRow,
}: Setup = {}) {
  const productFindFirst = vi
    .fn()
    .mockResolvedValueOnce(productRow)
    .mockResolvedValue(
      refreshedProductRow ?? createProductRow({ stockItems: [stockItem()] }),
    );
  return {
    product: {
      findMany: vi.fn().mockResolvedValue(products),
      findFirst: productFindFirst,
    },
    warehouse: {
      findFirst: vi.fn().mockResolvedValue(warehouseRow),
    },
    stockItem: {
      findFirst: vi.fn().mockResolvedValue(existingStockItem),
      create: vi.fn().mockResolvedValue(
        createdStockItem ?? {
          id: 'stock-new',
          productId: 'product-1',
          warehouseId: 'warehouse-1',
          quantity: '10',
        },
      ),
      update: vi.fn().mockResolvedValue(
        updatedStockItem ?? {
          id: 'stock-1',
          productId: 'product-1',
          warehouseId: 'warehouse-1',
          quantity: '10',
        },
      ),
    },
  };
}

describe('StockItemsService', () => {
  beforeEach(() => {
    auditLog.mockClear();
    auditList.mockClear();
  });

  it('list: hic StockItem kaydi olmayan urunler icin 0 miktarli "sanal" satir uretir', async () => {
    const prisma = createPrisma({
      products: [createProductRow({ stockItems: [] })],
    });
    const service = new StockItemsService(
      prisma as never,
      fakeAudit,
      fakeProductsCache,
    );
    const result = await service.list({ page: 1, pageSize: 20 } as never);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].productId).toBe('product-1');
    expect(Number(result.data[0].quantity)).toBe(0);
    expect(result.data[0].id).not.toBe('product-1');
    expect(result.data[0].warehouses).toEqual([]);
  });

  it('list: tek depoda StockItem kaydi varsa onu kullanir', async () => {
    const prisma = createPrisma({
      products: [
        createProductRow({
          stockItems: [stockItem({ id: 'stock-1', quantity: '10.000' })],
        }),
      ],
    });
    const service = new StockItemsService(
      prisma as never,
      fakeAudit,
      fakeProductsCache,
    );
    const result = await service.list({ page: 1, pageSize: 20 } as never);
    expect(result.data[0].id).toBe('stock-1');
    expect(Number(result.data[0].quantity)).toBe(10);
    expect(result.data[0].warehouses).toEqual([
      {
        warehouseId: 'warehouse-1',
        warehouseName: 'Ana Depo',
        quantity: '10.000',
      },
    ]);
  });

  it('list: birden fazla depodaki miktarlari toplayip kirilimini doner', async () => {
    const prisma = createPrisma({
      products: [
        createProductRow({
          stockItems: [
            stockItem({
              id: 'stock-1',
              warehouseId: 'warehouse-1',
              warehouse: { id: 'warehouse-1', name: 'Ana Depo' },
              quantity: '10.000',
            }),
            stockItem({
              id: 'stock-2',
              warehouseId: 'warehouse-2',
              warehouse: { id: 'warehouse-2', name: 'Sube Depo' },
              quantity: '5.000',
            }),
          ],
        }),
      ],
    });
    const service = new StockItemsService(
      prisma as never,
      fakeAudit,
      fakeProductsCache,
    );
    const result = await service.list({ page: 1, pageSize: 20 } as never);
    expect(Number(result.data[0].quantity)).toBe(15);
    expect(result.data[0].warehouses).toHaveLength(2);
    expect(result.data[0].warehouses.map((w) => w.warehouseName)).toEqual([
      'Ana Depo',
      'Sube Depo',
    ]);
  });

  it('listLowStock: minStockLevel tanimsizsa disari birakir', async () => {
    const prisma = createPrisma({
      products: [
        createProductRow({
          minStockLevel: null,
          stockItems: [stockItem({ quantity: '3.000' })],
        }),
      ],
    });
    const service = new StockItemsService(
      prisma as never,
      fakeAudit,
      fakeProductsCache,
    );
    const result = await service.listLowStock();
    expect(result).toHaveLength(0);
  });

  it('listLowStock: quantity minStockLevele esit ya da altindaysa dahil eder (ST1)', async () => {
    const prisma = createPrisma({
      products: [
        createProductRow({
          id: 'product-1',
          stockItems: [
            stockItem({ productId: 'product-1', quantity: '5.000' }),
          ],
        }), // esit -> dahil
        createProductRow({
          id: 'product-2',
          name: 'Klavye',
          minStockLevel: 5,
          stockItems: [
            stockItem({
              id: 'stock-2',
              productId: 'product-2',
              quantity: '3.000',
            }),
          ],
        }), // altinda -> dahil
        createProductRow({
          id: 'product-3',
          name: 'Monitor',
          minStockLevel: 5,
          stockItems: [
            stockItem({
              id: 'stock-3',
              productId: 'product-3',
              quantity: '10.000',
            }),
          ],
        }), // ustunde -> disarida
      ],
    });
    const service = new StockItemsService(
      prisma as never,
      fakeAudit,
      fakeProductsCache,
    );
    const result = await service.listLowStock();
    expect(result.map((r) => r.productId)).toEqual(['product-1', 'product-2']);
  });

  it('listLowStock: hic stok girilmemis urun icin (0 varsayilan) esik asilmissa dahil eder', async () => {
    const prisma = createPrisma({
      products: [createProductRow({ minStockLevel: 5, stockItems: [] })],
    });
    const service = new StockItemsService(
      prisma as never,
      fakeAudit,
      fakeProductsCache,
    );
    const result = await service.listLowStock();
    expect(result).toHaveLength(1);
  });

  it('upsertByProductId: urun bulunamazsa NOT_FOUND firlatir', async () => {
    const prisma = createPrisma({ productRow: null });
    const service = new StockItemsService(
      prisma as never,
      fakeAudit,
      fakeProductsCache,
    );
    await expect(
      service.upsertByProductId('yok', {
        warehouseId: 'warehouse-1',
        quantity: 5,
      }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<AppException>);
  });

  it('upsertByProductId: depo bulunamazsa NOT_FOUND firlatir', async () => {
    const prisma = createPrisma({ warehouseRow: null });
    const service = new StockItemsService(
      prisma as never,
      fakeAudit,
      fakeProductsCache,
    );
    await expect(
      service.upsertByProductId('product-1', {
        warehouseId: 'yok',
        quantity: 5,
      }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<AppException>);
  });

  it('upsertByProductId: mevcut stok kaydi yoksa create eder', async () => {
    const prisma = createPrisma({ existingStockItem: null });
    const service = new StockItemsService(
      prisma as never,
      fakeAudit,
      fakeProductsCache,
    );
    await service.upsertByProductId('product-1', {
      warehouseId: 'warehouse-1',
      quantity: 12,
    });
    expect(prisma.stockItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          productId: 'product-1',
          warehouseId: 'warehouse-1',
          quantity: 12,
        }),
      }),
    );
    expect(prisma.stockItem.update).not.toHaveBeenCalled();
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CREATE' }),
    );
  });

  it('upsertByProductId: mevcut stok kaydi varsa update eder', async () => {
    const prisma = createPrisma({
      existingStockItem: {
        id: 'stock-1',
        productId: 'product-1',
        warehouseId: 'warehouse-1',
        quantity: '3',
      },
    });
    const service = new StockItemsService(
      prisma as never,
      fakeAudit,
      fakeProductsCache,
    );
    await service.upsertByProductId('product-1', {
      warehouseId: 'warehouse-1',
      quantity: 20,
    });
    expect(prisma.stockItem.update).toHaveBeenCalledWith({
      where: { id: 'stock-1' },
      data: { quantity: 20 },
    });
    expect(prisma.stockItem.create).not.toHaveBeenCalled();
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'UPDATE' }),
    );
  });

  it('upsertByProductId: guncellemede denetim kaydina onceki ve yeni miktari, depo bilgisiyle birlikte yazar', async () => {
    const prisma = createPrisma({
      existingStockItem: {
        id: 'stock-1',
        productId: 'product-1',
        warehouseId: 'warehouse-1',
        quantity: '3',
      },
    });
    const service = new StockItemsService(
      prisma as never,
      fakeAudit,
      fakeProductsCache,
    );
    await service.upsertByProductId('product-1', {
      warehouseId: 'warehouse-1',
      quantity: 20,
    });
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'UPDATE',
        meta: expect.objectContaining({
          warehouseId: 'warehouse-1',
          warehouseName: 'Ana Depo',
          previousQuantity: '3',
          quantity: 20,
        }),
      }),
    );
  });

  it('upsertByProductId: not girilirse denetim kaydinda note null olur, girilirse aynen yazilir', async () => {
    const prisma = createPrisma({ existingStockItem: null });
    const service = new StockItemsService(
      prisma as never,
      fakeAudit,
      fakeProductsCache,
    );
    await service.upsertByProductId('product-1', {
      warehouseId: 'warehouse-1',
      quantity: 12,
    });
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        meta: expect.objectContaining({ note: null }),
      }),
    );

    auditLog.mockClear();
    await service.upsertByProductId('product-1', {
      warehouseId: 'warehouse-1',
      quantity: 12,
      note: 'Sayim farki',
    });
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        meta: expect.objectContaining({ note: 'Sayim farki' }),
      }),
    );
  });

  it('listHistory: AuditService kayitlarini StockItem entity ile filtreleyip tabloya uygun sekle cevirir', async () => {
    auditList.mockResolvedValue([
      {
        id: 'log-1',
        userId: 'u1',
        userName: 'Ada',
        userEmail: 'ada@test.com',
        action: 'UPDATE',
        entity: 'StockItem',
        entityId: 'stock-1',
        meta: {
          productId: 'product-1',
          productName: 'Sunucu',
          warehouseId: 'warehouse-1',
          warehouseName: 'Ana Depo',
          previousQuantity: 5,
          quantity: 8,
          note: 'Sayim farki',
        },
        createdAt: new Date('2026-09-28T00:00:00.000Z'),
      },
    ]);
    const prisma = createPrisma();
    const service = new StockItemsService(
      prisma as never,
      fakeAudit,
      fakeProductsCache,
    );
    const result = await service.listHistory({});
    expect(auditList).toHaveBeenCalledWith('StockItem', {
      userId: undefined,
      meta: undefined,
    });
    expect(result).toEqual([
      {
        id: 'log-1',
        productId: 'product-1',
        productName: 'Sunucu',
        warehouseId: 'warehouse-1',
        warehouseName: 'Ana Depo',
        userName: 'Ada',
        userEmail: 'ada@test.com',
        note: 'Sayim farki',
        previousQuantity: 5,
        quantity: 8,
        delta: 3,
        createdAt: new Date('2026-09-28T00:00:00.000Z'),
      },
    ]);
  });

  it('listHistory: productId, warehouseId ve userId filtreleri AuditService.list cagrisina aktarilir', async () => {
    auditList.mockResolvedValue([]);
    const prisma = createPrisma();
    const service = new StockItemsService(
      prisma as never,
      fakeAudit,
      fakeProductsCache,
    );
    await service.listHistory({
      productId: 'product-1',
      warehouseId: 'warehouse-1',
      userId: 'u1',
    });
    expect(auditList).toHaveBeenCalledWith('StockItem', {
      userId: 'u1',
      meta: { productId: 'product-1', warehouseId: 'warehouse-1' },
    });
  });

  describe('transferStock', () => {
    const productRow = { id: 'product-1', name: 'Sunucu', minStockLevel: 5 };
    const warehouses: Record<string, { id: string; name: string }> = {
      'w-from': { id: 'w-from', name: 'Ana Depo' },
      'w-to': { id: 'w-to', name: 'Sube Depo' },
    };

    function createTransferPrisma(opts: {
      fromStockItem?: unknown;
      toStockItem?: unknown;
    }) {
      const stockItemFindFirst = vi
        .fn()
        .mockImplementation(({ where }: { where: { warehouseId: string } }) =>
          Promise.resolve(
            where.warehouseId === 'w-from'
              ? (opts.fromStockItem ?? null)
              : (opts.toStockItem ?? null),
          ),
        );
      return {
        product: {
          findFirst: vi
            .fn()
            .mockResolvedValueOnce(productRow)
            .mockResolvedValue(
              createProductRow({
                stockItems: [
                  stockItem({
                    id: 'stock-from',
                    warehouseId: 'w-from',
                    warehouse: warehouses['w-from'],
                  }),
                  stockItem({
                    id: 'stock-to',
                    warehouseId: 'w-to',
                    warehouse: warehouses['w-to'],
                  }),
                ],
              }),
            ),
        },
        warehouse: {
          findFirst: vi
            .fn()
            .mockImplementation(({ where }: { where: { id: string } }) =>
              Promise.resolve(warehouses[where.id] ?? null),
            ),
        },
        stockItem: {
          findFirst: stockItemFindFirst,
          update: vi
            .fn()
            .mockImplementation(({ where, data }) =>
              Promise.resolve({ id: where.id, ...data }),
            ),
          create: vi
            .fn()
            .mockImplementation(({ data }) =>
              Promise.resolve({ id: 'stock-new', ...data }),
            ),
        },
      };
    }

    it('kaynak depoda yeterli stok yoksa INSUFFICIENT_STOCK firlatir', async () => {
      const prisma = createTransferPrisma({
        fromStockItem: { id: 'stock-from', quantity: '2' },
      });
      const service = new StockItemsService(
        prisma as never,
        fakeAudit,
        fakeProductsCache,
      );
      await expect(
        service.transferStock('product-1', {
          fromWarehouseId: 'w-from',
          toWarehouseId: 'w-to',
          quantity: 5,
        }),
      ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
      expect(prisma.stockItem.update).not.toHaveBeenCalled();
    });

    it('yeterli stok varsa kaynaktan dusup hedefe ekler, iki ayri denetim kaydi yazar', async () => {
      const prisma = createTransferPrisma({
        fromStockItem: { id: 'stock-from', quantity: '10' },
        toStockItem: { id: 'stock-to', quantity: '3' },
      });
      const service = new StockItemsService(
        prisma as never,
        fakeAudit,
        fakeProductsCache,
      );
      await service.transferStock('product-1', {
        fromWarehouseId: 'w-from',
        toWarehouseId: 'w-to',
        quantity: 4,
      });

      expect(prisma.stockItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'stock-from' },
          data: { quantity: 6 },
        }),
      );
      expect(prisma.stockItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'stock-to' },
          data: { quantity: 7 },
        }),
      );
      expect(auditLog).toHaveBeenCalledTimes(2);
      expect(auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          meta: expect.objectContaining({
            warehouseId: 'w-from',
            previousQuantity: '10',
            quantity: 6,
          }),
        }),
      );
      expect(auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          meta: expect.objectContaining({
            warehouseId: 'w-to',
            previousQuantity: '3',
            quantity: 7,
          }),
        }),
      );
    });

    it('hedef depoda henuz stok kaydi yoksa yeni satir olusturur', async () => {
      const prisma = createTransferPrisma({
        fromStockItem: { id: 'stock-from', quantity: '10' },
        toStockItem: null,
      });
      const service = new StockItemsService(
        prisma as never,
        fakeAudit,
        fakeProductsCache,
      );
      await service.transferStock('product-1', {
        fromWarehouseId: 'w-from',
        toWarehouseId: 'w-to',
        quantity: 4,
      });
      expect(prisma.stockItem.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            productId: 'product-1',
            warehouseId: 'w-to',
            quantity: 4,
          }),
        }),
      );
    });
  });
});
