import { AppException } from '../../core/errors/app.exception';
import { QuotesService } from './quotes.service';

const auditLog = vi.fn();
const fakeAudit = { log: auditLog } as never;
const surveyQueueAdd = vi.fn();
const fakeSurveyQueue = { add: surveyQueueAdd } as never;

function createQuoteRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'quote-1',
    quoteNumber: 'TEK-2026-09-06-001',
    accountId: 'account-1',
    contactId: null,
    status: 'APPROVED',
    items: [],
    account: {},
    contact: null,
    opportunity: null,
    ...overrides,
  };
}

function createProduct(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'product-1',
    name: 'Dizustu Bilgisayar',
    maxDiscountPct: null,
    price: null,
    ...overrides,
  };
}

interface Setup {
  quoteRow: unknown;
  products: unknown[];
  contact?: unknown;
  postSaleCase?: unknown;
}

function createPrisma({ quoteRow, products, contact, postSaleCase }: Setup) {
  const tx = {
    product: { findMany: vi.fn().mockResolvedValue(products) },
    contact: {
      findFirst: vi
        .fn()
        .mockResolvedValue(
          contact ?? { id: 'contact-1', accountId: 'account-1' },
        ),
    },
    tenantSetting: { findFirst: vi.fn().mockResolvedValue(null) },
    postSaleCase: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi
        .fn()
        .mockResolvedValue(postSaleCase ?? { id: 'psc-1', contactId: null }),
    },
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
  beforeEach(() => {
    auditLog.mockClear();
    surveyQueueAdd.mockClear();
  });

  it('getById: bulunamayan teklif icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma({ quoteRow: null, products: [] });
    const service = new QuotesService(
      prisma as never,
      fakeAudit,
      fakeSurveyQueue,
    );
    await expect(service.getById('yok')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<AppException>);
  });

  it('create: iskonto sinirindan bagimsiz her zaman DRAFT olusturur', async () => {
    const prisma = createPrisma({
      quoteRow: createQuoteRow({ status: 'DRAFT' }),
      products: [createProduct({ maxDiscountPct: 10 })],
    });
    const service = new QuotesService(
      prisma as never,
      fakeAudit,
      fakeSurveyQueue,
    );
    await service.create('user-1', {
      accountId: 'account-1',
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
        data: expect.objectContaining({ status: 'DRAFT' }),
      }),
    );
  });

  it('create: manuel unitPrice verilmezse Product.price kullanilir', async () => {
    const prisma = createPrisma({
      quoteRow: createQuoteRow(),
      products: [createProduct({ price: 250 })],
    });
    const service = new QuotesService(
      prisma as never,
      fakeAudit,
      fakeSurveyQueue,
    );
    await service.create('user-1', {
      accountId: 'account-1',
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

  it('create: Product.price tanimli degil ve manuel fiyat da girilmezse PRICE_NOT_FOUND firlatir', async () => {
    const prisma = createPrisma({
      quoteRow: createQuoteRow(),
      products: [createProduct()],
    });
    const service = new QuotesService(
      prisma as never,
      fakeAudit,
      fakeSurveyQueue,
    );
    await expect(
      service.create('user-1', {
        accountId: 'account-1',
        items: [
          { productId: 'product-1', quantity: 1, discountPct: 0, vatPct: 0 },
        ],
      } as never),
    ).rejects.toMatchObject({ code: 'PRICE_NOT_FOUND' });
  });

  it('create: bulunamayan urun icin PRODUCT_NOT_FOUND firlatir', async () => {
    const prisma = createPrisma({ quoteRow: createQuoteRow(), products: [] });
    const service = new QuotesService(
      prisma as never,
      fakeAudit,
      fakeSurveyQueue,
    );
    await expect(
      service.create('user-1', {
        accountId: 'account-1',
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
    });
    const service = new QuotesService(
      prisma as never,
      fakeAudit,
      fakeSurveyQueue,
    );
    await service.create('user-1', {
      accountId: 'account-1',
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

  it('create: contactId secilen firmaya ait degilse CONTACT_ACCOUNT_MISMATCH firlatir', async () => {
    const prisma = createPrisma({
      quoteRow: createQuoteRow(),
      products: [createProduct()],
      contact: { id: 'contact-1', accountId: 'baska-firma' },
    });
    const service = new QuotesService(
      prisma as never,
      fakeAudit,
      fakeSurveyQueue,
    );
    await expect(
      service.create('user-1', {
        accountId: 'account-1',
        contactId: 'contact-1',
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
    ).rejects.toMatchObject({ code: 'CONTACT_ACCOUNT_MISMATCH' });
  });

  it('create: DRAFT olusturulan teklif icin PostSaleCase acmaz (S1 sadece APPROVED icin)', async () => {
    const prisma = createPrisma({
      quoteRow: createQuoteRow({ status: 'DRAFT', contactId: 'contact-1' }),
      products: [createProduct()],
    });
    const service = new QuotesService(
      prisma as never,
      fakeAudit,
      fakeSurveyQueue,
    );
    await service.create('user-1', {
      accountId: 'account-1',
      contactId: 'contact-1',
      items: [
        {
          productId: 'product-1',
          quantity: 1,
          unitPrice: 10,
          discountPct: 0,
          vatPct: 0,
        },
      ],
    } as never);

    expect(prisma.__tx.postSaleCase.create).not.toHaveBeenCalled();
    expect(surveyQueueAdd).not.toHaveBeenCalled();
  });

  it('update: onaylanmis teklif duzenlenemez', async () => {
    const prisma = createPrisma({
      quoteRow: createQuoteRow({ status: 'APPROVED' }),
      products: [],
    });
    const service = new QuotesService(
      prisma as never,
      fakeAudit,
      fakeSurveyQueue,
    );
    await expect(
      service.update('quote-1', { items: [] } as never, 'user-1'),
    ).rejects.toMatchObject({ code: 'QUOTE_NOT_EDITABLE' });
  });

  it('update: /teklifler listesindeki durum dropdown status: APPROVED gonderince PostSaleCase acar', async () => {
    const prisma = createPrisma({
      quoteRow: createQuoteRow({
        status: 'DRAFT',
        contactId: 'contact-1',
      }),
      products: [],
      postSaleCase: { id: 'psc-1', contactId: 'contact-1' },
    });
    const service = new QuotesService(
      prisma as never,
      fakeAudit,
      fakeSurveyQueue,
    );
    await service.update(
      'quote-1',
      { status: 'APPROVED' } as never,
      'manager-1',
    );

    expect(prisma.__tx.quote.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'APPROVED',
          approvedById: 'manager-1',
        }),
      }),
    );
    expect(prisma.__tx.postSaleCase.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ quoteId: 'quote-1' }),
      }),
    );
    expect(surveyQueueAdd).toHaveBeenCalledWith('send-post-sale-survey', {
      postSaleCaseId: 'psc-1',
    });
  });

  it('update: dropdown status: REJECTED gonderince PostSaleCase acmadan reddeder', async () => {
    const prisma = createPrisma({
      quoteRow: createQuoteRow({ status: 'DRAFT' }),
      products: [],
    });
    const service = new QuotesService(
      prisma as never,
      fakeAudit,
      fakeSurveyQueue,
    );
    await service.update(
      'quote-1',
      { status: 'REJECTED' } as never,
      'manager-1',
    );

    expect(prisma.__tx.quote.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'REJECTED',
          approvedById: 'manager-1',
        }),
      }),
    );
    expect(prisma.__tx.postSaleCase.create).not.toHaveBeenCalled();
  });

  it('approve: onay bekleyen teklifi onaylar', async () => {
    const prisma = createPrisma({
      quoteRow: createQuoteRow({ status: 'PENDING_APPROVAL' }),
      products: [],
    });
    const service = new QuotesService(
      prisma as never,
      fakeAudit,
      fakeSurveyQueue,
    );
    await service.approve('quote-1', 'manager-1');
    expect(prisma.__tx.quote.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'APPROVED',
          approvedById: 'manager-1',
        }),
      }),
    );
  });

  it('approve: S1 - PostSaleCase acar, contactId varsa anket kuyruguna ekler', async () => {
    const prisma = createPrisma({
      quoteRow: createQuoteRow({
        status: 'PENDING_APPROVAL',
        contactId: 'contact-1',
      }),
      products: [],
      postSaleCase: { id: 'psc-1', contactId: 'contact-1' },
    });
    const service = new QuotesService(
      prisma as never,
      fakeAudit,
      fakeSurveyQueue,
    );
    await service.approve('quote-1', 'manager-1');

    expect(prisma.__tx.postSaleCase.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          quoteId: 'quote-1',
          accountId: 'account-1',
          contactId: 'contact-1',
        }),
      }),
    );
    expect(surveyQueueAdd).toHaveBeenCalledWith('send-post-sale-survey', {
      postSaleCaseId: 'psc-1',
    });
  });

  it('approve: contactId yoksa anket kuyruguna eklemez', async () => {
    const prisma = createPrisma({
      quoteRow: createQuoteRow({ status: 'PENDING_APPROVAL', contactId: null }),
      products: [],
      postSaleCase: { id: 'psc-1', contactId: null },
    });
    const service = new QuotesService(
      prisma as never,
      fakeAudit,
      fakeSurveyQueue,
    );
    await service.approve('quote-1', 'manager-1');

    expect(surveyQueueAdd).not.toHaveBeenCalled();
  });

  it('approve: onay bekleyen degilse QUOTE_NOT_PENDING firlatir', async () => {
    const prisma = createPrisma({
      quoteRow: createQuoteRow({ status: 'APPROVED' }),
      products: [],
    });
    const service = new QuotesService(
      prisma as never,
      fakeAudit,
      fakeSurveyQueue,
    );
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
    });
    const service = new QuotesService(
      prisma as never,
      fakeAudit,
      fakeSurveyQueue,
    );
    await service.reject('quote-1', 'manager-1');
    expect(prisma.quote.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'REJECTED' }),
      }),
    );
  });

  it('remove: teklifi siler ve audit log yazar', async () => {
    const prisma = createPrisma({ quoteRow: createQuoteRow(), products: [] });
    const service = new QuotesService(
      prisma as never,
      fakeAudit,
      fakeSurveyQueue,
    );
    await service.remove('quote-1');
    expect(prisma.quote.delete).toHaveBeenCalledWith({
      where: { id: 'quote-1' },
    });
  });
});
