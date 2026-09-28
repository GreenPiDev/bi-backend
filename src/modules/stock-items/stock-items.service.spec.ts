import { AppException } from '../../core/errors/app.exception';
import { StockItemsService } from './stock-items.service';

const auditLog = vi.fn();
const auditList = vi.fn();
const fakeAudit = { log: auditLog, list: auditList } as never;

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

interface Setup {
  products?: unknown[];
  productRow?: unknown;
  existingStockItem?: unknown;
  createdStockItem?: unknown;
  updatedStockItem?: unknown;
}

function createPrisma({
  products = [],
  productRow = { id: 'product-1', name: 'Sunucu', minStockLevel: 5 },
  existingStockItem = null,
  createdStockItem,
  updatedStockItem,
}: Setup = {}) {
  return {
    product: {
      findMany: vi.fn().mockResolvedValue(products),
      findFirst: vi.fn().mockResolvedValue(productRow),
    },
    stockItem: {
      findFirst: vi.fn().mockResolvedValue(existingStockItem),
      create: vi.fn().mockResolvedValue(
        createdStockItem ?? {
          id: 'stock-new',
          productId: 'product-1',
          quantity: '10',
        },
      ),
      update: vi.fn().mockResolvedValue(
        updatedStockItem ?? {
          id: 'stock-1',
          productId: 'product-1',
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
    const service = new StockItemsService(prisma as never, fakeAudit);
    const result = await service.list({ page: 1, pageSize: 20 } as never);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].productId).toBe('product-1');
    expect(Number(result.data[0].quantity)).toBe(0);
    expect(result.data[0].id).not.toBe('product-1');
  });

  it('list: gercek StockItem kaydi varsa onu kullanir', async () => {
    const prisma = createPrisma({
      products: [
        createProductRow({
          stockItems: [
            { id: 'stock-1', productId: 'product-1', quantity: '10.000' },
          ],
        }),
      ],
    });
    const service = new StockItemsService(prisma as never, fakeAudit);
    const result = await service.list({ page: 1, pageSize: 20 } as never);
    expect(result.data[0].id).toBe('stock-1');
    expect(Number(result.data[0].quantity)).toBe(10);
  });

  it('listLowStock: minStockLevel tanimsizsa disari birakir', async () => {
    const prisma = createPrisma({
      products: [
        createProductRow({
          productId: 'product-1',
          minStockLevel: null,
          stockItems: [
            { id: 'stock-1', productId: 'product-1', quantity: '3.000' },
          ],
        }),
      ],
    });
    const service = new StockItemsService(prisma as never, fakeAudit);
    const result = await service.listLowStock();
    expect(result).toHaveLength(0);
  });

  it('listLowStock: quantity minStockLevele esit ya da altindaysa dahil eder (ST1)', async () => {
    const prisma = createPrisma({
      products: [
        createProductRow({
          id: 'product-1',
          stockItems: [
            { id: 'stock-1', productId: 'product-1', quantity: '5.000' },
          ],
        }), // esit -> dahil
        createProductRow({
          id: 'product-2',
          name: 'Klavye',
          minStockLevel: 5,
          stockItems: [
            { id: 'stock-2', productId: 'product-2', quantity: '3.000' },
          ],
        }), // altinda -> dahil
        createProductRow({
          id: 'product-3',
          name: 'Monitor',
          minStockLevel: 5,
          stockItems: [
            { id: 'stock-3', productId: 'product-3', quantity: '10.000' },
          ],
        }), // ustunde -> disarida
      ],
    });
    const service = new StockItemsService(prisma as never, fakeAudit);
    const result = await service.listLowStock();
    expect(result.map((r) => r.productId)).toEqual(['product-1', 'product-2']);
  });

  it('listLowStock: hic stok girilmemis urun icin (0 varsayilan) esik asilmissa dahil eder', async () => {
    const prisma = createPrisma({
      products: [createProductRow({ minStockLevel: 5, stockItems: [] })],
    });
    const service = new StockItemsService(prisma as never, fakeAudit);
    const result = await service.listLowStock();
    expect(result).toHaveLength(1);
  });

  it('upsertByProductId: urun bulunamazsa NOT_FOUND firlatir', async () => {
    const prisma = createPrisma({ productRow: null });
    const service = new StockItemsService(prisma as never, fakeAudit);
    await expect(
      service.upsertByProductId('yok', { quantity: 5 }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<AppException>);
  });

  it('upsertByProductId: mevcut stok kaydi yoksa create eder', async () => {
    const prisma = createPrisma({ existingStockItem: null });
    const service = new StockItemsService(prisma as never, fakeAudit);
    await service.upsertByProductId('product-1', { quantity: 12 });
    expect(prisma.stockItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ productId: 'product-1', quantity: 12 }),
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
        quantity: '3',
      },
    });
    const service = new StockItemsService(prisma as never, fakeAudit);
    await service.upsertByProductId('product-1', { quantity: 20 });
    expect(prisma.stockItem.update).toHaveBeenCalledWith({
      where: { id: 'stock-1' },
      data: { quantity: 20 },
    });
    expect(prisma.stockItem.create).not.toHaveBeenCalled();
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'UPDATE' }),
    );
  });

  it('upsertByProductId: guncellemede denetim kaydina onceki ve yeni miktari birlikte yazar', async () => {
    const prisma = createPrisma({
      existingStockItem: {
        id: 'stock-1',
        productId: 'product-1',
        quantity: '3',
      },
    });
    const service = new StockItemsService(prisma as never, fakeAudit);
    await service.upsertByProductId('product-1', { quantity: 20 });
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'UPDATE',
        meta: expect.objectContaining({
          previousQuantity: '3',
          quantity: 20,
        }),
      }),
    );
  });

  it('upsertByProductId: not girilirse denetim kaydinda note null olur, girilirse aynen yazilir', async () => {
    const prisma = createPrisma({ existingStockItem: null });
    const service = new StockItemsService(prisma as never, fakeAudit);
    await service.upsertByProductId('product-1', { quantity: 12 });
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        meta: expect.objectContaining({ note: null }),
      }),
    );

    auditLog.mockClear();
    await service.upsertByProductId('product-1', {
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
          previousQuantity: 5,
          quantity: 8,
          note: 'Sayim farki',
        },
        createdAt: new Date('2026-09-28T00:00:00.000Z'),
      },
    ]);
    const prisma = createPrisma();
    const service = new StockItemsService(prisma as never, fakeAudit);
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

  it('listHistory: productId ve userId filtreleri AuditService.list cagrisina aktarilir', async () => {
    auditList.mockResolvedValue([]);
    const prisma = createPrisma();
    const service = new StockItemsService(prisma as never, fakeAudit);
    await service.listHistory({ productId: 'product-1', userId: 'u1' });
    expect(auditList).toHaveBeenCalledWith('StockItem', {
      userId: 'u1',
      meta: { productId: 'product-1' },
    });
  });
});
