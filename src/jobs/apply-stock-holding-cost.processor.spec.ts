import { Prisma } from '@prisma/client';
import { ApplyStockHoldingCostProcessor } from './apply-stock-holding-cost.processor';

const TENANT_ID = 't1';

function createProduct(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'p1',
    tenantId: TENANT_ID,
    avgCost: new Prisma.Decimal('100'),
    stockItems: [{ warehouseId: 'w1', quantity: new Prisma.Decimal('10') }],
    ...overrides,
  };
}

function createPrisma(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    tenantSetting: {
      findMany: vi.fn().mockResolvedValue([
        {
          tenantId: TENANT_ID,
          value: { enabled: true, monthlyRatePct: 3.5 },
        },
      ]),
    },
    product: {
      findMany: vi.fn().mockResolvedValue([createProduct()]),
      update: vi.fn().mockResolvedValue({}),
    },
    stockHoldingCostLog: {
      create: vi.fn().mockResolvedValue({}),
    },
    ...overrides,
  };
}

function createProductsCache() {
  return { invalidate: vi.fn().mockResolvedValue(undefined) };
}

describe('ApplyStockHoldingCostProcessor', () => {
  it('etkin ve stogu olan urunun avgCost unu arttirir ve tenant basina ozet log yazar', async () => {
    const prisma = createPrisma();
    const productsCache = createProductsCache();
    const processor = new ApplyStockHoldingCostProcessor(
      prisma as never,
      productsCache as never,
    );
    await processor.process();

    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { avgCost: expect.any(Prisma.Decimal) },
    });
    const updatedCost = (prisma.product.update as ReturnType<typeof vi.fn>).mock
      .calls[0][0].data.avgCost as Prisma.Decimal;
    expect(updatedCost.toNumber()).toBeGreaterThan(100);
    expect(updatedCost.toNumber()).toBeLessThan(100.2);

    expect(prisma.stockHoldingCostLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: TENANT_ID,
        productCount: 1,
        totalCostDelta: expect.any(Prisma.Decimal),
      }),
    });
    expect(productsCache.invalidate).toHaveBeenCalledTimes(1);
  });

  it('birden fazla urun varsa tek bir ozet log satiri yazar', async () => {
    const prisma = createPrisma();
    prisma.product.findMany = vi
      .fn()
      .mockResolvedValue([
        createProduct({ id: 'p1' }),
        createProduct({ id: 'p2' }),
      ]);
    const productsCache = createProductsCache();
    const processor = new ApplyStockHoldingCostProcessor(
      prisma as never,
      productsCache as never,
    );
    await processor.process();

    expect(prisma.stockHoldingCostLog.create).toHaveBeenCalledTimes(1);
    expect(prisma.stockHoldingCostLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ productCount: 2 }),
    });
  });

  it('ayar devre disiysa hicbir urun islenmez', async () => {
    const prisma = createPrisma();
    prisma.tenantSetting.findMany = vi
      .fn()
      .mockResolvedValue([
        { tenantId: TENANT_ID, value: { enabled: false, monthlyRatePct: 3.5 } },
      ]);
    const productsCache = createProductsCache();
    const processor = new ApplyStockHoldingCostProcessor(
      prisma as never,
      productsCache as never,
    );
    await processor.process();

    expect(prisma.product.findMany).not.toHaveBeenCalled();
    expect(prisma.product.update).not.toHaveBeenCalled();
  });

  it('oran 0 ise hicbir urun islenmez', async () => {
    const prisma = createPrisma();
    prisma.tenantSetting.findMany = vi
      .fn()
      .mockResolvedValue([
        { tenantId: TENANT_ID, value: { enabled: true, monthlyRatePct: 0 } },
      ]);
    const productsCache = createProductsCache();
    const processor = new ApplyStockHoldingCostProcessor(
      prisma as never,
      productsCache as never,
    );
    await processor.process();

    expect(prisma.product.update).not.toHaveBeenCalled();
  });

  it('stogu olmayan (toplam miktar 0) urun atlanir', async () => {
    const prisma = createPrisma();
    prisma.product.findMany = vi.fn().mockResolvedValue([
      createProduct({
        stockItems: [{ warehouseId: 'w1', quantity: new Prisma.Decimal('0') }],
      }),
    ]);
    const productsCache = createProductsCache();
    const processor = new ApplyStockHoldingCostProcessor(
      prisma as never,
      productsCache as never,
    );
    await processor.process();

    expect(prisma.product.update).not.toHaveBeenCalled();
    expect(prisma.stockHoldingCostLog.create).not.toHaveBeenCalled();
  });

  it('maliyeti tanimsiz (null) olan urun atlanir', async () => {
    const prisma = createPrisma();
    prisma.product.findMany = vi
      .fn()
      .mockResolvedValue([createProduct({ avgCost: null })]);
    const productsCache = createProductsCache();
    const processor = new ApplyStockHoldingCostProcessor(
      prisma as never,
      productsCache as never,
    );
    await processor.process();

    expect(prisma.product.update).not.toHaveBeenCalled();
  });

  it('bir tenant hata verirse digerlerini etkilemez', async () => {
    const prisma = createPrisma();
    prisma.tenantSetting.findMany = vi.fn().mockResolvedValue([
      { tenantId: 't-bad', value: { enabled: true, monthlyRatePct: 3.5 } },
      { tenantId: TENANT_ID, value: { enabled: true, monthlyRatePct: 3.5 } },
    ]);
    prisma.product.findMany = vi
      .fn()
      .mockRejectedValueOnce(new Error('DB down'))
      .mockResolvedValueOnce([createProduct()]);
    const productsCache = createProductsCache();
    const processor = new ApplyStockHoldingCostProcessor(
      prisma as never,
      productsCache as never,
    );
    await expect(processor.process()).resolves.toBeUndefined();
    expect(prisma.product.update).toHaveBeenCalledTimes(1);
  });
});
