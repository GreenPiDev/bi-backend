import { Prisma } from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import { TenantContext } from '../../core/tenant/tenant-context';
import { StockItemsService } from './stock-items.service';

function runInTenant<T>(fn: () => Promise<T>): Promise<T> {
  return TenantContext.run({ tenantId: 't1', userId: 'u1', roleIds: [] }, fn);
}

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
}

function createPrisma({ products = [] }: Setup = {}) {
  return {
    product: {
      findMany: vi.fn().mockResolvedValue(products),
    },
  };
}

describe('StockItemsService', () => {
  it('list: hic StockItem kaydi olmayan urunler icin 0 miktarli "sanal" satir uretir', async () => {
    const prisma = createPrisma({
      products: [createProductRow({ stockItems: [] })],
    });
    const service = new StockItemsService(prisma as never, fakeProductsCache);
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
    const service = new StockItemsService(prisma as never, fakeProductsCache);
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
    const service = new StockItemsService(prisma as never, fakeProductsCache);
    const result = await service.list({ page: 1, pageSize: 20 } as never);
    expect(Number(result.data[0].quantity)).toBe(15);
    expect(result.data[0].warehouses).toHaveLength(2);
    expect(result.data[0].warehouses.map((w) => w.warehouseName)).toEqual([
      'Ana Depo',
      'Sube Depo',
    ]);
  });

  it('list: sort=name:asc, urunleri Turkce isme gore siralar', async () => {
    const prisma = createPrisma({
      products: [
        createProductRow({ id: 'p1', name: 'Zebra' }),
        createProductRow({ id: 'p2', name: 'Akor' }),
      ],
    });
    const service = new StockItemsService(prisma as never, fakeProductsCache);
    const result = await service.list({
      page: 1,
      pageSize: 20,
      sort: 'name:asc',
    } as never);
    expect(result.data.map((row) => row.productId)).toEqual(['p2', 'p1']);
  });

  it('list: sort=quantity:asc, miktara gore kucukten buyuge siralar', async () => {
    const prisma = createPrisma({
      products: [
        createProductRow({
          id: 'p1',
          stockItems: [stockItem({ id: 's1', quantity: '10.000' })],
        }),
        createProductRow({
          id: 'p2',
          stockItems: [stockItem({ id: 's2', quantity: '2.000' })],
        }),
      ],
    });
    const service = new StockItemsService(prisma as never, fakeProductsCache);
    const result = await service.list({
      page: 1,
      pageSize: 20,
      sort: 'quantity:asc',
    } as never);
    expect(result.data.map((row) => row.productId)).toEqual(['p2', 'p1']);
  });

  it('list: sort=quantity:desc, miktara gore buyukten kucuge siralar', async () => {
    const prisma = createPrisma({
      products: [
        createProductRow({
          id: 'p1',
          stockItems: [stockItem({ id: 's1', quantity: '10.000' })],
        }),
        createProductRow({
          id: 'p2',
          stockItems: [stockItem({ id: 's2', quantity: '2.000' })],
        }),
      ],
    });
    const service = new StockItemsService(prisma as never, fakeProductsCache);
    const result = await service.list({
      page: 1,
      pageSize: 20,
      sort: 'quantity:desc',
    } as never);
    expect(result.data.map((row) => row.productId)).toEqual(['p1', 'p2']);
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
    const service = new StockItemsService(prisma as never, fakeProductsCache);
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
    const service = new StockItemsService(prisma as never, fakeProductsCache);
    const result = await service.listLowStock();
    expect(result.map((r) => r.productId)).toEqual(['product-1', 'product-2']);
  });

  it('listLowStock: hic stok girilmemis urun icin (0 varsayilan) esik asilmissa dahil eder', async () => {
    const prisma = createPrisma({
      products: [createProductRow({ minStockLevel: 5, stockItems: [] })],
    });
    const service = new StockItemsService(prisma as never, fakeProductsCache);
    const result = await service.listLowStock();
    expect(result).toHaveLength(1);
  });

  describe('increaseStock / decreaseStock (WAC)', () => {
    function createWacPrisma(
      opts: {
        productRow?: Record<string, unknown>;
        warehouseRow?: Record<string, unknown> | null;
        stockItems?: Record<string, unknown>[];
        refreshedProductRow?: Record<string, unknown>;
      } = {},
    ) {
      const productRow = opts.productRow ?? {
        id: 'product-1',
        name: 'Sunucu',
        avgCost: null,
      };
      const warehouseRow =
        opts.warehouseRow === undefined
          ? { id: 'warehouse-1', name: 'Ana Depo' }
          : opts.warehouseRow;
      const stockItems = opts.stockItems ?? [];

      const tx = {
        product: {
          findFirst: vi.fn().mockResolvedValue(productRow),
          update: vi
            .fn()
            .mockImplementation(({ data }) =>
              Promise.resolve({ ...productRow, ...data }),
            ),
        },
        warehouse: {
          findFirst: vi.fn().mockResolvedValue(warehouseRow),
        },
        stockItem: {
          findMany: vi.fn().mockResolvedValue(stockItems),
          findFirst: vi
            .fn()
            .mockImplementation(
              ({ where }: { where: { warehouseId: string } }) =>
                Promise.resolve(
                  stockItems.find(
                    (si) => si.warehouseId === where.warehouseId,
                  ) ?? null,
                ),
            ),
          create: vi
            .fn()
            .mockImplementation(({ data }) =>
              Promise.resolve({ id: 'stock-new', ...data }),
            ),
          update: vi
            .fn()
            .mockImplementation(({ where, data }) =>
              Promise.resolve({ id: where.id, ...data }),
            ),
        },
        stockMovement: {
          create: vi.fn().mockResolvedValue({ id: 'movement-1' }),
        },
      };

      const prisma = {
        $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(tx)),
        product: {
          findFirst: vi
            .fn()
            .mockResolvedValue(
              opts.refreshedProductRow ?? createProductRow({ stockItems: [] }),
            ),
        },
      };

      return { prisma, tx };
    }

    it('increaseStock: sifirdan baslangicta yeni ortalama maliyet girilen birim maliyete esittir', async () => {
      const { prisma, tx } = createWacPrisma({ stockItems: [] });
      const service = new StockItemsService(prisma as never, fakeProductsCache);
      await runInTenant(() =>
        service.increaseStock('product-1', {
          warehouseId: 'warehouse-1',
          quantity: 15,
          unitCost: 5,
        }),
      );
      const newAvgCost = tx.product.update.mock.calls[0][0].data.avgCost;
      expect(newAvgCost.toString()).toBe('5');
      expect(tx.stockMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'INCREASE',
            createdById: 'u1',
          }),
        }),
      );
    });

    it('increaseStock: ardarda farkli maliyetli iki giris agirlikli ortalamayi dogru hesaplar', async () => {
      // 5 TL'den 15 adet zaten depoda (ilk giristen sonraki durum), simdi 10 TL'den 3 adet daha giriyor.
      const { prisma, tx } = createWacPrisma({
        productRow: { id: 'product-1', name: 'Sunucu', avgCost: '5' },
        stockItems: [
          {
            id: 'stock-1',
            productId: 'product-1',
            warehouseId: 'warehouse-1',
            quantity: '15',
          },
        ],
      });
      const service = new StockItemsService(prisma as never, fakeProductsCache);
      await runInTenant(() =>
        service.increaseStock('product-1', {
          warehouseId: 'warehouse-1',
          quantity: 3,
          unitCost: 10,
        }),
      );
      const newAvgCost = tx.product.update.mock.calls[0][0].data.avgCost;
      // (15*5 + 3*10) / 18 = 105/18 = 5.8333...
      expect(newAvgCost.toFixed(4)).toBe('5.8333');
      const newQuantity = tx.stockItem.update.mock.calls[0][0].data.quantity;
      expect(newQuantity.toString()).toBe('18');
    });

    it('increaseStock: farkli depolardaki mevcut miktar da urun toplamina dahil edilir', async () => {
      const { prisma, tx } = createWacPrisma({
        productRow: { id: 'product-1', name: 'Sunucu', avgCost: '4' },
        stockItems: [
          {
            id: 'stock-1',
            productId: 'product-1',
            warehouseId: 'warehouse-1',
            quantity: '10',
          },
          {
            id: 'stock-2',
            productId: 'product-1',
            warehouseId: 'warehouse-2',
            quantity: '10',
          },
        ],
      });
      const service = new StockItemsService(prisma as never, fakeProductsCache);
      await runInTenant(() =>
        service.increaseStock('product-1', {
          warehouseId: 'warehouse-2',
          quantity: 20,
          unitCost: 10,
        }),
      );
      const newAvgCost = tx.product.update.mock.calls[0][0].data.avgCost;
      // oldTotalQty = 20 (iki depo toplami), (20*4 + 20*10) / 40 = 280/40 = 7
      expect(newAvgCost.toString()).toBe('7');
    });

    it('decreaseStock: ortalama maliyeti degistirmez, sadece miktari dusurur', async () => {
      const { prisma, tx } = createWacPrisma({
        productRow: { id: 'product-1', name: 'Sunucu', avgCost: '5.8333' },
        stockItems: [
          {
            id: 'stock-1',
            productId: 'product-1',
            warehouseId: 'warehouse-1',
            quantity: '18',
          },
        ],
      });
      const service = new StockItemsService(prisma as never, fakeProductsCache);
      await runInTenant(() =>
        service.decreaseStock('product-1', {
          warehouseId: 'warehouse-1',
          quantity: 5,
        }),
      );
      expect(tx.product.update).not.toHaveBeenCalled();
      const newQuantity = tx.stockItem.update.mock.calls[0][0].data.quantity;
      expect(newQuantity.toString()).toBe('13');
      expect(tx.stockMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'DECREASE', unitCost: null }),
        }),
      );
    });

    it('decreaseStock: yetersiz stokta negatife dusmesine izin verir (karar 6)', async () => {
      const { prisma, tx } = createWacPrisma({
        stockItems: [
          {
            id: 'stock-1',
            productId: 'product-1',
            warehouseId: 'warehouse-1',
            quantity: '2',
          },
        ],
      });
      const service = new StockItemsService(prisma as never, fakeProductsCache);
      await runInTenant(() =>
        service.decreaseStock('product-1', {
          warehouseId: 'warehouse-1',
          quantity: 5,
        }),
      );
      const newQuantity = tx.stockItem.update.mock.calls[0][0].data.quantity;
      expect(newQuantity.toString()).toBe('-3');
    });

    it('increaseStock: urun bulunamazsa NOT_FOUND firlatir', async () => {
      const tx = {
        product: { findFirst: vi.fn().mockResolvedValue(null) },
      };
      const prisma = {
        $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(tx)),
      };
      const service = new StockItemsService(prisma as never, fakeProductsCache);
      await expect(
        runInTenant(() =>
          service.increaseStock('yok', {
            warehouseId: 'warehouse-1',
            quantity: 1,
            unitCost: 1,
          }),
        ),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
      } satisfies Partial<AppException>);
    });

    it('runSerializableStockWrite: P2034 yazma catismasinda yeniden dener, sonunda basarili olur', async () => {
      const { prisma, tx } = createWacPrisma({ stockItems: [] });
      let attempts = 0;
      prisma.$transaction = vi.fn((fn: (tx: unknown) => unknown) => {
        attempts += 1;
        if (attempts < 3) {
          throw new Prisma.PrismaClientKnownRequestError('conflict', {
            code: 'P2034',
            clientVersion: 'test',
          });
        }
        return fn(tx);
      });
      const service = new StockItemsService(prisma as never, fakeProductsCache);
      await runInTenant(() =>
        service.increaseStock('product-1', {
          warehouseId: 'warehouse-1',
          quantity: 1,
          unitCost: 1,
        }),
      );
      expect(attempts).toBe(3);
    });
  });

  describe('transferStock', () => {
    const productRow = { id: 'product-1', name: 'Sunucu' };
    const warehouses: Record<string, { id: string; name: string }> = {
      'w-from': { id: 'w-from', name: 'Ana Depo' },
      'w-to': { id: 'w-to', name: 'Sube Depo' },
    };

    function createTransferPrisma(opts: {
      fromStockItem?: Record<string, unknown> | null;
      toStockItem?: Record<string, unknown> | null;
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
      const tx = {
        product: { findFirst: vi.fn().mockResolvedValue(productRow) },
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
        stockMovement: {
          create: vi.fn().mockResolvedValue({ id: 'movement-out' }),
        },
      };
      const prisma = {
        $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(tx)),
        product: {
          findFirst: vi.fn().mockResolvedValue(
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
      };
      return { prisma, tx };
    }

    it('kaynak depoda yeterli stok yoksa INSUFFICIENT_STOCK firlatir', async () => {
      const { prisma, tx } = createTransferPrisma({
        fromStockItem: { id: 'stock-from', quantity: '2' },
      });
      const service = new StockItemsService(prisma as never, fakeProductsCache);
      await expect(
        runInTenant(() =>
          service.transferStock('product-1', {
            fromWarehouseId: 'w-from',
            toWarehouseId: 'w-to',
            quantity: 5,
          }),
        ),
      ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
      expect(tx.stockItem.update).not.toHaveBeenCalled();
    });

    it('yeterli stok varsa kaynaktan dusup hedefe ekler, iki ayri hareket yazar (TRANSFER_OUT/TRANSFER_IN)', async () => {
      const { prisma, tx } = createTransferPrisma({
        fromStockItem: { id: 'stock-from', quantity: '10' },
        toStockItem: { id: 'stock-to', quantity: '3' },
      });
      const service = new StockItemsService(prisma as never, fakeProductsCache);
      await runInTenant(() =>
        service.transferStock('product-1', {
          fromWarehouseId: 'w-from',
          toWarehouseId: 'w-to',
          quantity: 4,
        }),
      );

      expect(tx.stockItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'stock-from' },
          data: { quantity: expect.anything() },
        }),
      );
      const fromNewQuantity =
        tx.stockItem.update.mock.calls[0][0].data.quantity;
      expect(fromNewQuantity.toString()).toBe('6');
      const toNewQuantity = tx.stockItem.update.mock.calls[1][0].data.quantity;
      expect(toNewQuantity.toString()).toBe('7');

      expect(tx.stockMovement.create).toHaveBeenCalledTimes(2);
      expect(tx.stockMovement.create).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'TRANSFER_OUT',
            warehouseId: 'w-from',
          }),
        }),
      );
      expect(tx.stockMovement.create).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'TRANSFER_IN',
            warehouseId: 'w-to',
            relatedMovementId: 'movement-out',
          }),
        }),
      );
    });

    it('hedef depoda henuz stok kaydi yoksa yeni satir olusturur', async () => {
      const { prisma, tx } = createTransferPrisma({
        fromStockItem: { id: 'stock-from', quantity: '10' },
        toStockItem: null,
      });
      const service = new StockItemsService(prisma as never, fakeProductsCache);
      await runInTenant(() =>
        service.transferStock('product-1', {
          fromWarehouseId: 'w-from',
          toWarehouseId: 'w-to',
          quantity: 4,
        }),
      );
      expect(tx.stockItem.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            productId: 'product-1',
            warehouseId: 'w-to',
            quantity: expect.anything(),
          }),
        }),
      );
      const createdQuantity =
        tx.stockItem.create.mock.calls[0][0].data.quantity;
      expect(createdQuantity.toString()).toBe('4');
    });
  });

  describe('listHistory', () => {
    it('StockMovement kayitlarini urun/depo/kullanici bilgisiyle birlikte dondurur', async () => {
      const prisma = {
        stockMovement: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: 'mv-1',
              productId: 'product-1',
              product: { name: 'Sunucu' },
              warehouseId: 'warehouse-1',
              warehouse: { name: 'Ana Depo' },
              type: 'INCREASE',
              note: 'Alim',
              previousQuantity: new Prisma.Decimal(5),
              quantity: new Prisma.Decimal(3),
              newQuantity: new Prisma.Decimal(8),
              unitCost: new Prisma.Decimal(10),
              previousAvgCost: new Prisma.Decimal(8),
              newAvgCost: new Prisma.Decimal(8.75),
              quoteId: null,
              createdById: 'u1',
              createdAt: new Date('2026-09-28T00:00:00.000Z'),
            },
          ]),
        },
        user: {
          findMany: vi
            .fn()
            .mockResolvedValue([
              { id: 'u1', name: 'Ada', email: 'ada@test.com' },
            ]),
        },
      };
      const service = new StockItemsService(prisma as never, fakeProductsCache);
      const result = await service.listHistory({});
      expect(result).toEqual([
        {
          id: 'mv-1',
          productId: 'product-1',
          productName: 'Sunucu',
          warehouseId: 'warehouse-1',
          warehouseName: 'Ana Depo',
          userName: 'Ada',
          userEmail: 'ada@test.com',
          type: 'INCREASE',
          note: 'Alim',
          previousQuantity: 5,
          quantity: 3,
          newQuantity: 8,
          delta: 3,
          unitCost: 10,
          previousAvgCost: 8,
          newAvgCost: 8.75,
          quoteId: null,
          createdAt: new Date('2026-09-28T00:00:00.000Z'),
        },
      ]);
    });

    it('productId, warehouseId ve userId filtreleri StockMovement.findMany sorgusuna aktarilir', async () => {
      const findMany = vi.fn().mockResolvedValue([]);
      const prisma = {
        stockMovement: { findMany },
        user: { findMany: vi.fn().mockResolvedValue([]) },
      };
      const service = new StockItemsService(prisma as never, fakeProductsCache);
      await service.listHistory({
        productId: 'product-1',
        warehouseId: 'warehouse-1',
        userId: 'u1',
      });
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            productId: 'product-1',
            warehouseId: 'warehouse-1',
            createdById: 'u1',
          },
        }),
      );
    });
  });
});
