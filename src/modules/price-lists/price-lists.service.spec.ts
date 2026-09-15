import { AppException } from '../../core/errors/app.exception';
import { PriceListsService } from './price-lists.service';

const auditLog = vi.fn();
const fakeAudit = { log: auditLog } as never;

function createPriceListRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'price-list-1',
    productListId: 'product-list-1',
    name: 'Standart Fiyat Listesi',
    isDefault: false,
    items: [],
    productList: { id: 'product-list-1', name: 'Genel' },
    ...overrides,
  };
}

function createPrisma(
  row: unknown = createPriceListRow(),
  productsInList: string[] = ['product-1', 'product-2'],
) {
  const tx = {
    priceList: {
      create: vi.fn().mockResolvedValue(row),
      update: vi.fn().mockResolvedValue(row),
    },
    priceListItem: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    product: {
      findMany: vi.fn(
        (args: { where: { id: { in: string[] } } }) =>
          Promise.resolve(
            args.where.id.in
              .filter((id) => productsInList.includes(id))
              .map((id) => ({ id })),
          ) as never,
      ),
    },
  };
  return {
    priceList: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      findFirst: vi.fn().mockResolvedValue(row),
      delete: vi.fn().mockResolvedValue(row),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(tx)),
    __tx: tx,
  };
}

describe('PriceListsService', () => {
  it('getById: bulunamayan fiyat listesi icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma(null);
    const service = new PriceListsService(prisma as never, fakeAudit);
    await expect(service.getById('yok')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<AppException>);
  });

  it('create: fiyat listesini urunleriyle birlikte olusturur ve audit log yazar', async () => {
    const prisma = createPrisma();
    const service = new PriceListsService(prisma as never, fakeAudit);
    await service.create({
      productListId: 'product-list-1',
      name: 'Standart Fiyat Listesi',
      items: [{ productId: 'product-1', unitPrice: 100 }],
    });
    expect(prisma.__tx.priceList.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          productListId: 'product-list-1',
          name: 'Standart Fiyat Listesi',
          items: { create: [{ productId: 'product-1', unitPrice: 100 }] },
        }),
      }),
    );
    expect(auditLog).toHaveBeenCalled();
  });

  it('create: urun listesine ait olmayan urun eklenmek istenirse PRODUCT_NOT_IN_LIST firlatir', async () => {
    const prisma = createPrisma(createPriceListRow(), []);
    const service = new PriceListsService(prisma as never, fakeAudit);
    await expect(
      service.create({
        productListId: 'product-list-1',
        name: 'Standart Fiyat Listesi',
        items: [{ productId: 'baska-listeden-urun', unitPrice: 100 }],
      }),
    ).rejects.toMatchObject({ code: 'PRODUCT_NOT_IN_LIST' });
  });

  it('update: items verilirse eski satirlari silip yenilerini yazar', async () => {
    const prisma = createPrisma();
    const service = new PriceListsService(prisma as never, fakeAudit);
    await service.update('price-list-1', {
      items: [{ productId: 'product-2', unitPrice: 50 }],
    });
    expect(prisma.__tx.priceListItem.deleteMany).toHaveBeenCalledWith({
      where: { priceListId: 'price-list-1' },
    });
    expect(prisma.__tx.priceListItem.createMany).toHaveBeenCalledWith({
      data: [
        { productId: 'product-2', unitPrice: 50, priceListId: 'price-list-1' },
      ],
    });
  });

  it('update: mevcut urun listesine ait olmayan urun eklenmek istenirse PRODUCT_NOT_IN_LIST firlatir', async () => {
    const prisma = createPrisma(createPriceListRow(), []);
    const service = new PriceListsService(prisma as never, fakeAudit);
    await expect(
      service.update('price-list-1', {
        items: [{ productId: 'baska-listeden-urun', unitPrice: 50 }],
      }),
    ).rejects.toMatchObject({ code: 'PRODUCT_NOT_IN_LIST' });
  });

  it('remove: bulunamayan fiyat listesi icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma(null);
    const service = new PriceListsService(prisma as never, fakeAudit);
    await expect(service.remove('yok')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
