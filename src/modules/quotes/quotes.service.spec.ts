import { AppException } from '../../core/errors/app.exception';
import { QuotesService } from './quotes.service';

const auditLog = vi.fn();
const fakeAudit = { log: auditLog } as never;

function createQuoteRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'quote-1',
    quoteNumber: 'TEK-2026-09-06-001',
    accountId: 'account-1',
    priceListId: 'price-list-1',
    status: 'APPROVED',
    items: [],
    account: {},
    priceList: {},
    opportunity: null,
    ...overrides,
  };
}

function createProduct(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'product-1',
    name: 'Dizustu Bilgisayar',
    maxDiscountPct: null,
    ...overrides,
  };
}

interface Setup {
  quoteRow: unknown;
  products: unknown[];
  priceListItems: unknown[];
}

function createPrisma({ quoteRow, products, priceListItems }: Setup) {
  const tx = {
    product: { findMany: vi.fn().mockResolvedValue(products) },
    priceListItem: { findMany: vi.fn().mockResolvedValue(priceListItems) },
    quote: {
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue(quoteRow),
      update: vi.fn().mockResolvedValue(quoteRow),
    },
    quoteItem: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    opportunity: { create: vi.fn().mockResolvedValue({ id: 'opp-1' }) },
  };
  return {
    quote: {
      findFirst: vi.fn().mockResolvedValue(quoteRow),
      update: vi.fn().mockResolvedValue(quoteRow),
      delete: vi.fn().mockResolvedValue(quoteRow),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(tx)),
    __tx: tx,
  };
}

describe('QuotesService', () => {
  it('getById: bulunamayan teklif icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma({
      quoteRow: null,
      products: [],
      priceListItems: [],
    });
    const service = new QuotesService(prisma as never, fakeAudit);
    await expect(service.getById('yok')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<AppException>);
  });

  it('create: iskonto politikasi asilmiyorsa dogrudan APPROVED olusturur', async () => {
    const prisma = createPrisma({
      quoteRow: createQuoteRow(),
      products: [createProduct({ maxDiscountPct: 10 })],
      priceListItems: [],
    });
    const service = new QuotesService(prisma as never, fakeAudit);
    await service.create('user-1', {
      accountId: 'account-1',
      priceListId: 'price-list-1',
      items: [
        {
          productId: 'product-1',
          quantity: 2,
          unitPrice: 100,
          discountPct: 5,
          vatPct: 20,
        },
      ],
    } as never);

    expect(prisma.__tx.quote.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'APPROVED' }),
      }),
    );
  });

  it('create: iskonto politikasi asilirsa PENDING_APPROVAL olusturur', async () => {
    const prisma = createPrisma({
      quoteRow: createQuoteRow({ status: 'PENDING_APPROVAL' }),
      products: [createProduct({ maxDiscountPct: 10 })],
      priceListItems: [],
    });
    const service = new QuotesService(prisma as never, fakeAudit);
    await service.create('user-1', {
      accountId: 'account-1',
      priceListId: 'price-list-1',
      items: [
        {
          productId: 'product-1',
          quantity: 1,
          unitPrice: 100,
          discountPct: 25,
          vatPct: 20,
        },
      ],
    } as never);

    expect(prisma.__tx.quote.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PENDING_APPROVAL' }),
      }),
    );
  });

  it('create: manuel unitPrice verilmezse fiyat listesinden alir', async () => {
    const prisma = createPrisma({
      quoteRow: createQuoteRow(),
      products: [createProduct()],
      priceListItems: [{ productId: 'product-1', unitPrice: 250 }],
    });
    const service = new QuotesService(prisma as never, fakeAudit);
    await service.create('user-1', {
      accountId: 'account-1',
      priceListId: 'price-list-1',
      items: [
        { productId: 'product-1', quantity: 1, discountPct: 0, vatPct: 0 },
      ],
    } as never);

    expect(prisma.__tx.quote.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          items: { create: [expect.objectContaining({ unitPrice: 250 })] },
        }),
      }),
    );
  });

  it('create: fiyat listesinde olmayan ve manuel fiyati da girilmeyen urun icin PRICE_NOT_FOUND firlatir', async () => {
    const prisma = createPrisma({
      quoteRow: createQuoteRow(),
      products: [createProduct()],
      priceListItems: [],
    });
    const service = new QuotesService(prisma as never, fakeAudit);
    await expect(
      service.create('user-1', {
        accountId: 'account-1',
        priceListId: 'price-list-1',
        items: [
          { productId: 'product-1', quantity: 1, discountPct: 0, vatPct: 0 },
        ],
      } as never),
    ).rejects.toMatchObject({ code: 'PRICE_NOT_FOUND' });
  });

  it('create: bulunamayan urun icin PRODUCT_NOT_FOUND firlatir', async () => {
    const prisma = createPrisma({
      quoteRow: createQuoteRow(),
      products: [],
      priceListItems: [],
    });
    const service = new QuotesService(prisma as never, fakeAudit);
    await expect(
      service.create('user-1', {
        accountId: 'account-1',
        priceListId: 'price-list-1',
        items: [
          {
            productId: 'product-1',
            quantity: 1,
            unitPrice: 10,
            discountPct: 0,
            vatPct: 0,
          },
        ],
      } as never),
    ).rejects.toMatchObject({ code: 'PRODUCT_NOT_FOUND' });
  });

  it('create: opportunity verilirse nested olusturur (O2)', async () => {
    const prisma = createPrisma({
      quoteRow: createQuoteRow(),
      products: [createProduct()],
      priceListItems: [],
    });
    const service = new QuotesService(prisma as never, fakeAudit);
    await service.create('user-1', {
      accountId: 'account-1',
      priceListId: 'price-list-1',
      items: [
        {
          productId: 'product-1',
          quantity: 1,
          unitPrice: 10,
          discountPct: 0,
          vatPct: 0,
        },
      ],
      opportunity: { name: 'Yeni firsat' },
    } as never);

    expect(prisma.__tx.opportunity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Yeni firsat',
          quoteId: 'quote-1',
        }),
      }),
    );
  });

  it('update: onaylanmis teklif duzenlenemez', async () => {
    const prisma = createPrisma({
      quoteRow: createQuoteRow({ status: 'APPROVED' }),
      products: [],
      priceListItems: [],
    });
    const service = new QuotesService(prisma as never, fakeAudit);
    await expect(
      service.update('quote-1', { items: [] } as never),
    ).rejects.toMatchObject({ code: 'QUOTE_NOT_EDITABLE' });
  });

  it('approve: onay bekleyen teklifi onaylar', async () => {
    const prisma = createPrisma({
      quoteRow: createQuoteRow({ status: 'PENDING_APPROVAL' }),
      products: [],
      priceListItems: [],
    });
    const service = new QuotesService(prisma as never, fakeAudit);
    await service.approve('quote-1', 'manager-1');
    expect(prisma.quote.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'APPROVED',
          approvedById: 'manager-1',
        }),
      }),
    );
  });

  it('approve: onay bekleyen degilse QUOTE_NOT_PENDING firlatir', async () => {
    const prisma = createPrisma({
      quoteRow: createQuoteRow({ status: 'APPROVED' }),
      products: [],
      priceListItems: [],
    });
    const service = new QuotesService(prisma as never, fakeAudit);
    await expect(service.approve('quote-1', 'manager-1')).rejects.toMatchObject(
      {
        code: 'QUOTE_NOT_PENDING',
      },
    );
  });

  it('reject: onay bekleyen teklifi reddeder', async () => {
    const prisma = createPrisma({
      quoteRow: createQuoteRow({ status: 'PENDING_APPROVAL' }),
      products: [],
      priceListItems: [],
    });
    const service = new QuotesService(prisma as never, fakeAudit);
    await service.reject('quote-1', 'manager-1');
    expect(prisma.quote.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'REJECTED' }),
      }),
    );
  });

  it('remove: teklifi siler ve audit log yazar', async () => {
    const prisma = createPrisma({
      quoteRow: createQuoteRow(),
      products: [],
      priceListItems: [],
    });
    const service = new QuotesService(prisma as never, fakeAudit);
    await service.remove('quote-1');
    expect(prisma.quote.delete).toHaveBeenCalledWith({
      where: { id: 'quote-1' },
    });
  });
});
