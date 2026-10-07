import { AppException } from '../../core/errors/app.exception';
import { TenantContext } from '../../core/tenant/tenant-context';
import { QuotesService } from './quotes.service';

function runInTenant<T>(fn: () => Promise<T>): Promise<T> {
  return TenantContext.run(
    { tenantId: 'tenant-1', userId: 'user-1', roleIds: [] },
    fn,
  );
}

const auditLog = vi.fn();
const fakeAudit = { log: auditLog } as never;
const surveyQueueAdd = vi.fn();
const fakeSurveyQueue = { add: surveyQueueAdd } as never;
const fakeQuotesCache = {
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn(),
  invalidate: vi.fn(),
} as never;
const fakeOpportunitiesCache = { invalidate: vi.fn() } as never;
const fakePostSaleCasesCache = { invalidate: vi.fn() } as never;
const fakeProductsCache = { invalidate: vi.fn() } as never;
const fakeFx = { getRatesToBase: vi.fn() } as never;
const fakeFileUrl = { build: vi.fn(() => null) } as never;
const notificationsCreate = vi.fn();
const fakeNotifications = { create: notificationsCreate } as never;
const decreaseStockTx = vi.fn();
const fakeStockItems = { decreaseStockTx } as never;

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
  actingUser?: unknown;
  activeUsers?: unknown[];
  existingStockMovement?: unknown;
}

function createPrisma({
  quoteRow,
  products,
  contact,
  postSaleCase,
  actingUser,
  activeUsers,
  existingStockMovement,
}: Setup) {
  const tx = {
    account: {
      findFirst: vi.fn().mockResolvedValue({ id: 'account-1' }),
    },
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
    $queryRaw: vi.fn().mockResolvedValue([{ count: 0n }]),
    quoteItem: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    opportunity: { create: vi.fn().mockResolvedValue({ id: 'opp-1' }) },
    quoteTemplate: { findFirst: vi.fn().mockResolvedValue(null) },
    stockMovement: {
      findFirst: vi.fn().mockResolvedValue(existingStockMovement ?? null),
    },
    quoteStatusHistory: {
      create: vi.fn().mockResolvedValue({ id: 'qsh-1' }),
    },
  };
  return {
    quote: {
      findFirst: vi.fn().mockResolvedValue(quoteRow),
      update: vi.fn().mockResolvedValue(quoteRow),
      delete: vi.fn().mockResolvedValue(quoteRow),
    },
    user: {
      findFirst: vi.fn().mockResolvedValue(actingUser ?? null),
      findMany: vi.fn().mockResolvedValue(activeUsers ?? []),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(tx)),
    quoteStatusHistory: tx.quoteStatusHistory,
    __tx: tx,
  };
}

describe('QuotesService', () => {
  beforeEach(() => {
    auditLog.mockClear();
    surveyQueueAdd.mockClear();
    decreaseStockTx.mockClear();
  });

  it('getById: bulunamayan teklif icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma({ quoteRow: null, products: [] });
    const service = new QuotesService(
      prisma as never,
      fakeAudit,
      fakeSurveyQueue,
      fakeQuotesCache,
      fakeOpportunitiesCache,
      fakePostSaleCasesCache,
      fakeProductsCache,
      fakeFx,
      fakeFileUrl,
      fakeNotifications,
      fakeStockItems,
    );
    await expect(service.getById('yok')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<AppException>);
  });

  it('create: iskonto sinirindan bagimsiz her zaman DRAFT olusturur', async () => {
    const prisma = createPrisma({
      quoteRow: createQuoteRow({ status: 'DRAFT' }),
      products: [createProduct({ maxDiscountPct: 10 })],
      actingUser: { id: 'user-1', name: 'Test User' },
    });
    const service = new QuotesService(
      prisma as never,
      fakeAudit,
      fakeSurveyQueue,
      fakeQuotesCache,
      fakeOpportunitiesCache,
      fakePostSaleCasesCache,
      fakeProductsCache,
      fakeFx,
      fakeFileUrl,
      fakeNotifications,
      fakeStockItems,
    );
    await runInTenant(() =>
      service.create('user-1', {
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
      } as never),
    );

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
      actingUser: { id: 'user-1', name: 'Test User' },
    });
    const service = new QuotesService(
      prisma as never,
      fakeAudit,
      fakeSurveyQueue,
      fakeQuotesCache,
      fakeOpportunitiesCache,
      fakePostSaleCasesCache,
      fakeProductsCache,
      fakeFx,
      fakeFileUrl,
      fakeNotifications,
      fakeStockItems,
    );
    await runInTenant(() =>
      service.create('user-1', {
        accountId: 'account-1',
        items: [
          { productId: 'product-1', quantity: 1, discountPct: 0, vatPct: 0 },
        ],
      } as never),
    );

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
      actingUser: { id: 'user-1', name: 'Test User' },
    });
    const service = new QuotesService(
      prisma as never,
      fakeAudit,
      fakeSurveyQueue,
      fakeQuotesCache,
      fakeOpportunitiesCache,
      fakePostSaleCasesCache,
      fakeProductsCache,
      fakeFx,
      fakeFileUrl,
      fakeNotifications,
      fakeStockItems,
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
    const prisma = createPrisma({
      quoteRow: createQuoteRow(),
      products: [],
      actingUser: { id: 'user-1', name: 'Test User' },
    });
    const service = new QuotesService(
      prisma as never,
      fakeAudit,
      fakeSurveyQueue,
      fakeQuotesCache,
      fakeOpportunitiesCache,
      fakePostSaleCasesCache,
      fakeProductsCache,
      fakeFx,
      fakeFileUrl,
      fakeNotifications,
      fakeStockItems,
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
      actingUser: { id: 'user-1', name: 'Test User' },
    });
    const service = new QuotesService(
      prisma as never,
      fakeAudit,
      fakeSurveyQueue,
      fakeQuotesCache,
      fakeOpportunitiesCache,
      fakePostSaleCasesCache,
      fakeProductsCache,
      fakeFx,
      fakeFileUrl,
      fakeNotifications,
      fakeStockItems,
    );
    await runInTenant(() =>
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
        opportunity: { name: 'Yeni firsat' },
      } as never),
    );

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
      actingUser: { id: 'user-1', name: 'Test User' },
    });
    const service = new QuotesService(
      prisma as never,
      fakeAudit,
      fakeSurveyQueue,
      fakeQuotesCache,
      fakeOpportunitiesCache,
      fakePostSaleCasesCache,
      fakeProductsCache,
      fakeFx,
      fakeFileUrl,
      fakeNotifications,
      fakeStockItems,
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
      actingUser: { id: 'user-1', name: 'Test User' },
    });
    const service = new QuotesService(
      prisma as never,
      fakeAudit,
      fakeSurveyQueue,
      fakeQuotesCache,
      fakeOpportunitiesCache,
      fakePostSaleCasesCache,
      fakeProductsCache,
      fakeFx,
      fakeFileUrl,
      fakeNotifications,
      fakeStockItems,
    );
    await runInTenant(() =>
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
    );

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
      fakeQuotesCache,
      fakeOpportunitiesCache,
      fakePostSaleCasesCache,
      fakeProductsCache,
      fakeFx,
      fakeFileUrl,
      fakeNotifications,
      fakeStockItems,
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
      fakeQuotesCache,
      fakeOpportunitiesCache,
      fakePostSaleCasesCache,
      fakeProductsCache,
      fakeFx,
      fakeFileUrl,
      fakeNotifications,
      fakeStockItems,
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
      fakeQuotesCache,
      fakeOpportunitiesCache,
      fakePostSaleCasesCache,
      fakeProductsCache,
      fakeFx,
      fakeFileUrl,
      fakeNotifications,
      fakeStockItems,
    );
    await service.update(
      'quote-1',
      { status: 'REJECTED', rejectionReason: 'Yüksek Fiyat' } as never,
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

  it('update: dropdown status: REVIZE gonderince tum aktif kullanicilara bildirim gider', async () => {
    const prisma = createPrisma({
      quoteRow: createQuoteRow({
        status: 'DRAFT',
        quoteNumber: 'TEK-2026-09-30-001',
        account: { name: 'Acme A.S.' },
      }),
      products: [],
      actingUser: { id: 'user-1', name: 'Ayse Yilmaz' },
      activeUsers: [{ id: 'user-1' }, { id: 'user-2' }],
    });
    const service = new QuotesService(
      prisma as never,
      fakeAudit,
      fakeSurveyQueue,
      fakeQuotesCache,
      fakeOpportunitiesCache,
      fakePostSaleCasesCache,
      fakeProductsCache,
      fakeFx,
      fakeFileUrl,
      fakeNotifications,
      fakeStockItems,
    );
    notificationsCreate.mockClear();
    await runInTenant(() =>
      service.update('quote-1', { status: 'REVIZE' } as never, 'user-1'),
    );

    expect(prisma.__tx.quote.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'REVIZE' }),
      }),
    );
    expect(notificationsCreate).toHaveBeenCalledTimes(2);
    expect(notificationsCreate).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({
        recipientUserId: 'user-1',
        type: 'QUOTE_REVISION_REQUESTED',
        relatedEntityType: 'Quote',
        relatedEntityId: 'quote-1',
        title: expect.stringContaining('TEK-2026-09-30-001'),
      }),
    );
    expect(notificationsCreate).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ recipientUserId: 'user-2' }),
    );
  });

  it('update: teklif zaten REVIZE durumundayken tekrar REVIZE gonderilirse bildirim tekrar gitmez', async () => {
    const prisma = createPrisma({
      quoteRow: createQuoteRow({ status: 'REVIZE' }),
      products: [],
      activeUsers: [{ id: 'user-1' }],
    });
    const service = new QuotesService(
      prisma as never,
      fakeAudit,
      fakeSurveyQueue,
      fakeQuotesCache,
      fakeOpportunitiesCache,
      fakePostSaleCasesCache,
      fakeProductsCache,
      fakeFx,
      fakeFileUrl,
      fakeNotifications,
      fakeStockItems,
    );
    notificationsCreate.mockClear();
    await runInTenant(() =>
      service.update('quote-1', { status: 'REVIZE' } as never, 'user-1'),
    );

    expect(notificationsCreate).not.toHaveBeenCalled();
  });

  it('update: durum degismeden contactId gonderilirse yine de yazilir', async () => {
    const prisma = createPrisma({
      quoteRow: createQuoteRow({ status: 'DRAFT' }),
      products: [],
      contact: { id: 'contact-2', accountId: 'account-1' },
    });
    const service = new QuotesService(
      prisma as never,
      fakeAudit,
      fakeSurveyQueue,
      fakeQuotesCache,
      fakeOpportunitiesCache,
      fakePostSaleCasesCache,
      fakeProductsCache,
      fakeFx,
      fakeFileUrl,
      fakeNotifications,
      fakeStockItems,
    );
    await service.update(
      'quote-1',
      { contactId: 'contact-2' } as never,
      'user-1',
    );

    expect(prisma.__tx.quote.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { contactId: 'contact-2' },
      }),
    );
  });

  it('update: contactId null gonderilirse muhatap kisi kaldirilir', async () => {
    const prisma = createPrisma({
      quoteRow: createQuoteRow({ status: 'DRAFT', contactId: 'contact-1' }),
      products: [],
    });
    const service = new QuotesService(
      prisma as never,
      fakeAudit,
      fakeSurveyQueue,
      fakeQuotesCache,
      fakeOpportunitiesCache,
      fakePostSaleCasesCache,
      fakeProductsCache,
      fakeFx,
      fakeFileUrl,
      fakeNotifications,
      fakeStockItems,
    );
    await service.update('quote-1', { contactId: null } as never, 'user-1');

    expect(prisma.__tx.quote.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { contactId: null },
      }),
    );
  });

  it('update: contactId secilen firmaya ait degilse CONTACT_ACCOUNT_MISMATCH firlatir', async () => {
    const prisma = createPrisma({
      quoteRow: createQuoteRow({ status: 'DRAFT' }),
      products: [],
      contact: { id: 'contact-2', accountId: 'other-account' },
    });
    const service = new QuotesService(
      prisma as never,
      fakeAudit,
      fakeSurveyQueue,
      fakeQuotesCache,
      fakeOpportunitiesCache,
      fakePostSaleCasesCache,
      fakeProductsCache,
      fakeFx,
      fakeFileUrl,
      fakeNotifications,
      fakeStockItems,
    );
    await expect(
      service.update('quote-1', { contactId: 'contact-2' } as never, 'user-1'),
    ).rejects.toMatchObject({ code: 'CONTACT_ACCOUNT_MISMATCH' });
  });

  it('update: REVIZE durumunda items gonderilip revisionNote olmadan REVISION_NOTE_REQUIRED firlatir', async () => {
    const prisma = createPrisma({
      quoteRow: createQuoteRow({
        status: 'REVIZE',
        quoteCurrency: 'TRY',
        exchangeRates: null,
        revisionCount: 0,
        items: [
          {
            product: { name: 'Eski Urun' },
            quantity: '1',
            unitPrice: '50',
            currency: 'TRY',
            discountPct: '0',
            vatPct: '0',
          },
        ],
      }),
      products: [createProduct({ id: 'product-1', price: 100 })],
    });
    const service = new QuotesService(
      prisma as never,
      fakeAudit,
      fakeSurveyQueue,
      fakeQuotesCache,
      fakeOpportunitiesCache,
      fakePostSaleCasesCache,
      fakeProductsCache,
      fakeFx,
      fakeFileUrl,
      fakeNotifications,
      fakeStockItems,
    );
    await expect(
      service.update(
        'quote-1',
        { items: [{ productId: 'product-1', quantity: 2 }] } as never,
        'user-1',
      ),
    ).rejects.toMatchObject({ code: 'REVISION_NOTE_REQUIRED' });
  });

  it('update: REVIZE durumunda items + revisionNote gonderilince eski kalemler snapshotlanir ve revisionCount artar', async () => {
    const prisma = createPrisma({
      quoteRow: createQuoteRow({
        status: 'REVIZE',
        quoteCurrency: 'TRY',
        exchangeRates: null,
        revisionCount: 2,
        items: [
          {
            product: { name: 'Eski Urun' },
            quantity: '1',
            unitPrice: '50',
            currency: 'TRY',
            discountPct: '0',
            vatPct: '0',
          },
        ],
      }),
      products: [
        createProduct({ id: 'product-1', price: 100, currency: 'TRY' }),
      ],
    });
    const service = new QuotesService(
      prisma as never,
      fakeAudit,
      fakeSurveyQueue,
      fakeQuotesCache,
      fakeOpportunitiesCache,
      fakePostSaleCasesCache,
      fakeProductsCache,
      fakeFx,
      fakeFileUrl,
      fakeNotifications,
      fakeStockItems,
    );
    await service.update(
      'quote-1',
      {
        items: [{ productId: 'product-1', quantity: 2 }],
        revisionNote: 'Musteri fiyat indirimi istedi',
      } as never,
      'user-1',
    );

    expect(prisma.__tx.quote.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          revisionNote: 'Musteri fiyat indirimi istedi',
          revisionCount: 3,
          lastRevisedAt: expect.any(Date),
          revisionSnapshot: expect.objectContaining({
            quoteCurrency: 'TRY',
            items: [
              expect.objectContaining({
                productName: 'Eski Urun',
                quantity: 1,
                unitPrice: 50,
              }),
            ],
          }),
        }),
      }),
    );
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
      fakeQuotesCache,
      fakeOpportunitiesCache,
      fakePostSaleCasesCache,
      fakeProductsCache,
      fakeFx,
      fakeFileUrl,
      fakeNotifications,
      fakeStockItems,
    );
    await service.approve('quote-1', 'manager-1', {
      warehouseId: 'warehouse-1',
    });
    expect(prisma.__tx.quote.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'APPROVED',
          approvedById: 'manager-1',
        }),
      }),
    );
  });

  it('approve: her teklif kalemi icin stokItems.decreaseStockTx QUOTE_SALE tipiyle cagrilir', async () => {
    const prisma = createPrisma({
      quoteRow: createQuoteRow({
        status: 'PENDING_APPROVAL',
        items: [
          { productId: 'product-1', quantity: 3 },
          { productId: 'product-2', quantity: 7 },
        ],
      }),
      products: [],
    });
    const service = new QuotesService(
      prisma as never,
      fakeAudit,
      fakeSurveyQueue,
      fakeQuotesCache,
      fakeOpportunitiesCache,
      fakePostSaleCasesCache,
      fakeProductsCache,
      fakeFx,
      fakeFileUrl,
      fakeNotifications,
      fakeStockItems,
    );
    await service.approve('quote-1', 'manager-1', {
      warehouseId: 'warehouse-1',
    });

    expect(decreaseStockTx).toHaveBeenCalledTimes(2);
    expect(decreaseStockTx).toHaveBeenCalledWith(
      prisma.__tx,
      expect.objectContaining({
        productId: 'product-1',
        warehouseId: 'warehouse-1',
        quantity: 3,
        type: 'QUOTE_SALE',
        quoteId: 'quote-1',
      }),
    );
    expect(decreaseStockTx).toHaveBeenCalledWith(
      prisma.__tx,
      expect.objectContaining({
        productId: 'product-2',
        warehouseId: 'warehouse-1',
        quantity: 7,
        type: 'QUOTE_SALE',
        quoteId: 'quote-1',
      }),
    );
  });

  it('approve: ayni teklif icin zaten bir QUOTE_SALE hareketi varsa tekrar dusmez (idempotent)', async () => {
    const prisma = createPrisma({
      quoteRow: createQuoteRow({
        status: 'PENDING_APPROVAL',
        items: [{ productId: 'product-1', quantity: 3 }],
      }),
      products: [],
      existingStockMovement: { id: 'mv-1' },
    });
    const service = new QuotesService(
      prisma as never,
      fakeAudit,
      fakeSurveyQueue,
      fakeQuotesCache,
      fakeOpportunitiesCache,
      fakePostSaleCasesCache,
      fakeProductsCache,
      fakeFx,
      fakeFileUrl,
      fakeNotifications,
      fakeStockItems,
    );
    await service.approve('quote-1', 'manager-1', {
      warehouseId: 'warehouse-1',
    });

    expect(decreaseStockTx).not.toHaveBeenCalled();
  });

  it("update: status APPROVED'a cekilince de teklif kalemleri stoktan duser", async () => {
    const prisma = createPrisma({
      quoteRow: createQuoteRow({
        status: 'PENDING_APPROVAL',
        items: [{ productId: 'product-1', quantity: 5 }],
      }),
      products: [],
    });
    const service = new QuotesService(
      prisma as never,
      fakeAudit,
      fakeSurveyQueue,
      fakeQuotesCache,
      fakeOpportunitiesCache,
      fakePostSaleCasesCache,
      fakeProductsCache,
      fakeFx,
      fakeFileUrl,
      fakeNotifications,
      fakeStockItems,
    );
    await service.update(
      'quote-1',
      { status: 'APPROVED', warehouseId: 'warehouse-2' } as never,
      'manager-1',
    );

    expect(decreaseStockTx).toHaveBeenCalledWith(
      prisma.__tx,
      expect.objectContaining({
        productId: 'product-1',
        warehouseId: 'warehouse-2',
        quantity: 5,
        type: 'QUOTE_SALE',
        quoteId: 'quote-1',
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
      fakeQuotesCache,
      fakeOpportunitiesCache,
      fakePostSaleCasesCache,
      fakeProductsCache,
      fakeFx,
      fakeFileUrl,
      fakeNotifications,
      fakeStockItems,
    );
    await service.approve('quote-1', 'manager-1', {
      warehouseId: 'warehouse-1',
    });

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
      fakeQuotesCache,
      fakeOpportunitiesCache,
      fakePostSaleCasesCache,
      fakeProductsCache,
      fakeFx,
      fakeFileUrl,
      fakeNotifications,
      fakeStockItems,
    );
    await service.approve('quote-1', 'manager-1', {
      warehouseId: 'warehouse-1',
    });

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
      fakeQuotesCache,
      fakeOpportunitiesCache,
      fakePostSaleCasesCache,
      fakeProductsCache,
      fakeFx,
      fakeFileUrl,
      fakeNotifications,
      fakeStockItems,
    );
    await expect(
      service.approve('quote-1', 'manager-1', { warehouseId: 'warehouse-1' }),
    ).rejects.toMatchObject({
      code: 'QUOTE_NOT_PENDING',
    });
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
      fakeQuotesCache,
      fakeOpportunitiesCache,
      fakePostSaleCasesCache,
      fakeProductsCache,
      fakeFx,
      fakeFileUrl,
      fakeNotifications,
      fakeStockItems,
    );
    await service.reject('quote-1', 'manager-1', { reason: 'Yüksek Fiyat' });
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
      fakeQuotesCache,
      fakeOpportunitiesCache,
      fakePostSaleCasesCache,
      fakeProductsCache,
      fakeFx,
      fakeFileUrl,
      fakeNotifications,
      fakeStockItems,
    );
    await service.remove('quote-1');
    expect(prisma.quote.delete).toHaveBeenCalledWith({
      where: { id: 'quote-1' },
    });
  });

  it('getRejectionReasonsSummary: en son REJECTED sebebine gore gruplar, sebebi olmayanlari null altinda toplar', async () => {
    const prisma = {
      quote: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }]),
      },
      quoteStatusHistory: {
        findMany: vi.fn().mockResolvedValue([
          {
            quoteId: 'q1',
            reason: 'Yüksek Fiyat',
            createdAt: new Date('2026-01-01'),
          },
          {
            quoteId: 'q2',
            reason: 'Bütçe Yetersiz',
            createdAt: new Date('2026-01-01'),
          },
          // q3 icin hic REJECTED gecmisi yok -> null grubuna dusmeli
        ]),
      },
    };
    const service = new QuotesService(
      prisma as never,
      fakeAudit,
      fakeSurveyQueue,
      fakeQuotesCache,
      fakeOpportunitiesCache,
      fakePostSaleCasesCache,
      fakeProductsCache,
      fakeFx,
      fakeFileUrl,
      fakeNotifications,
      fakeStockItems,
    );
    const result = await service.getRejectionReasonsSummary();
    expect(result).toEqual(
      expect.arrayContaining([
        { reason: 'Yüksek Fiyat', count: 1 },
        { reason: 'Bütçe Yetersiz', count: 1 },
        { reason: null, count: 1 },
      ]),
    );
  });

  it('getRejectedQuotesWithReasons: en yeni reddedilen ustte, her satir kendi sebebi/notuyla doner', async () => {
    const prisma = {
      quote: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'q1',
            quoteNumber: 'TEK-2026-01-01-001',
            account: { name: 'Acme' },
          },
          {
            id: 'q2',
            quoteNumber: 'TEK-2026-01-02-001',
            account: { name: 'Beta' },
          },
        ]),
      },
      quoteStatusHistory: {
        findMany: vi.fn().mockResolvedValue([
          {
            quoteId: 'q1',
            reason: 'Yüksek Fiyat',
            note: null,
            createdAt: new Date('2026-01-01'),
          },
          {
            quoteId: 'q2',
            reason: 'Bütçe Yetersiz',
            note: 'Müşteri bütçe revizesi bekliyor',
            createdAt: new Date('2026-01-05'),
          },
        ]),
      },
    };
    const service = new QuotesService(
      prisma as never,
      fakeAudit,
      fakeSurveyQueue,
      fakeQuotesCache,
      fakeOpportunitiesCache,
      fakePostSaleCasesCache,
      fakeProductsCache,
      fakeFx,
      fakeFileUrl,
      fakeNotifications,
      fakeStockItems,
    );
    const result = await service.getRejectedQuotesWithReasons();
    expect(result).toEqual([
      {
        id: 'q2',
        quoteNumber: 'TEK-2026-01-02-001',
        accountName: 'Beta',
        rejectedAt: new Date('2026-01-05'),
        reason: 'Bütçe Yetersiz',
        note: 'Müşteri bütçe revizesi bekliyor',
      },
      {
        id: 'q1',
        quoteNumber: 'TEK-2026-01-01-001',
        accountName: 'Acme',
        rejectedAt: new Date('2026-01-01'),
        reason: 'Yüksek Fiyat',
        note: null,
      },
    ]);
  });
});
