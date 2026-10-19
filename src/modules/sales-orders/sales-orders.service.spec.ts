import { AppException } from '../../core/errors/app.exception';
import { SalesOrdersService } from './sales-orders.service';

const auditLog = vi.fn();
const fakeAudit = { log: auditLog } as never;
const cacheInvalidate = vi.fn();
const fakeCache = {
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn(),
  invalidate: cacheInvalidate,
} as never;
const surveyQueueAdd = vi.fn();
const fakeSurveyQueue = { add: surveyQueueAdd } as never;
const postSaleCasesCacheInvalidate = vi.fn();
const fakePostSaleCasesCache = {
  invalidate: postSaleCasesCacheInvalidate,
} as never;

function createSalesOrderRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'so-1',
    orderNumber: 'SAT-2026-10-13-001',
    quoteId: 'quote-1',
    accountId: 'account-1',
    contactId: null,
    status: 'PENDING',
    account: { id: 'account-1', name: 'Acme' },
    contact: null,
    quote: { id: 'quote-1', quoteNumber: 'TEK-2026-10-13-001', items: [] },
    items: [],
    ...overrides,
  };
}

function createPrisma(salesOrderRow: unknown = createSalesOrderRow()) {
  return {
    salesOrder: {
      findMany: vi.fn().mockResolvedValue([salesOrderRow]),
      count: vi.fn().mockResolvedValue(1),
      findFirst: vi.fn().mockResolvedValue(salesOrderRow),
      update: vi.fn().mockResolvedValue(salesOrderRow),
      create: vi.fn().mockResolvedValue(salesOrderRow),
    },
    quote: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'quote-1',
        status: 'APPROVED',
        accountId: 'account-1',
        contactId: null,
      }),
    },
    account: {
      findFirst: vi.fn().mockResolvedValue({ id: 'account-1', name: 'Acme' }),
    },
    product: {
      findMany: vi
        .fn()
        .mockResolvedValue([{ id: 'product-1', currency: 'TRY', brand: null }]),
    },
    tenantSetting: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    postSaleCase: {
      create: vi.fn().mockResolvedValue({ id: 'psc-1', contactId: null }),
    },
  };
}

describe('SalesOrdersService', () => {
  beforeEach(() => {
    auditLog.mockClear();
    cacheInvalidate.mockClear();
    surveyQueueAdd.mockClear();
    postSaleCasesCacheInvalidate.mockClear();
  });

  it('list: sonuclari sayfalanmis halde doner', async () => {
    const prisma = createPrisma();
    const service = new SalesOrdersService(
      prisma as never,
      fakeAudit,
      fakeCache,
      fakeSurveyQueue,
      fakePostSaleCasesCache,
    );
    const result = await service.list({ page: 1, pageSize: 25 } as never);
    expect(result.meta.total).toBe(1);
    expect(result.data).toHaveLength(1);
  });

  it('getById: bulunamayan siparis icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma();
    prisma.salesOrder.findFirst = vi.fn().mockResolvedValue(null);
    const service = new SalesOrdersService(
      prisma as never,
      fakeAudit,
      fakeCache,
      fakeSurveyQueue,
      fakePostSaleCasesCache,
    );
    await expect(service.getById('yok')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<AppException>);
  });

  it('updateStatus: durumu gunceller, audit log yazar ve cache invalidate eder', async () => {
    const prisma = createPrisma();
    const service = new SalesOrdersService(
      prisma as never,
      fakeAudit,
      fakeCache,
      fakeSurveyQueue,
      fakePostSaleCasesCache,
    );
    await service.updateStatus('so-1', { status: 'SHIPPED' });
    expect(prisma.salesOrder.update).toHaveBeenCalledWith({
      where: { id: 'so-1' },
      data: { status: 'SHIPPED' },
    });
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'UPDATE', entity: 'SalesOrder' }),
    );
  });

  it('updateStatus: bulunamayan siparis icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma();
    prisma.salesOrder.findFirst = vi.fn().mockResolvedValue(null);
    const service = new SalesOrdersService(
      prisma as never,
      fakeAudit,
      fakeCache,
      fakeSurveyQueue,
      fakePostSaleCasesCache,
    );
    await expect(
      service.updateStatus('yok', { status: 'COMPLETED' }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<AppException>);
  });

  describe('create: quoteId ile (backfill)', () => {
    it('onayli teklif icin siparis olusturur, audit log yazar ve cache invalidate eder', async () => {
      const salesOrderRow = createSalesOrderRow();
      const prisma = createPrisma(salesOrderRow);
      prisma.salesOrder.findFirst = vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValue(salesOrderRow);
      const service = new SalesOrdersService(
        prisma as never,
        fakeAudit,
        fakeCache,
        fakeSurveyQueue,
        fakePostSaleCasesCache,
      );

      await service.create('user-1', { quoteId: 'quote-1' });

      expect(prisma.salesOrder.create).toHaveBeenCalledWith({
        data: {
          quoteId: 'quote-1',
          accountId: 'account-1',
          contactId: null,
          orderNumber: expect.stringMatching(/^SAT-\d{4}-\d{2}-\d{2}-\d{3}$/),
          createdById: 'user-1',
          items: { create: [] },
        },
      });
      expect(auditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CREATE', entity: 'SalesOrder' }),
      );
      expect(cacheInvalidate).toHaveBeenCalled();
      expect(prisma.postSaleCase.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          salesOrderId: 'so-1',
          quoteId: 'quote-1',
          accountId: 'account-1',
          contactId: null,
        }),
      });
      expect(postSaleCasesCacheInvalidate).toHaveBeenCalled();
    });

    it('teklif bulunamazsa NOT_FOUND firlatir', async () => {
      const prisma = createPrisma();
      prisma.quote.findFirst = vi.fn().mockResolvedValue(null);
      const service = new SalesOrdersService(
        prisma as never,
        fakeAudit,
        fakeCache,
        fakeSurveyQueue,
        fakePostSaleCasesCache,
      );

      await expect(
        service.create('user-1', { quoteId: 'yok' }),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
      } satisfies Partial<AppException>);
    });

    it('teklif onaylanmamissa QUOTE_NOT_APPROVED firlatir', async () => {
      const prisma = createPrisma();
      prisma.quote.findFirst = vi.fn().mockResolvedValue({
        id: 'quote-1',
        status: 'DRAFT',
        accountId: 'account-1',
        contactId: null,
      });
      const service = new SalesOrdersService(
        prisma as never,
        fakeAudit,
        fakeCache,
        fakeSurveyQueue,
        fakePostSaleCasesCache,
      );

      await expect(
        service.create('user-1', { quoteId: 'quote-1' }),
      ).rejects.toMatchObject({
        code: 'QUOTE_NOT_APPROVED',
      } satisfies Partial<AppException>);
    });

    it('teklifin zaten bir siparisi varsa SALES_ORDER_ALREADY_EXISTS firlatir', async () => {
      const prisma = createPrisma();
      const service = new SalesOrdersService(
        prisma as never,
        fakeAudit,
        fakeCache,
        fakeSurveyQueue,
        fakePostSaleCasesCache,
      );

      await expect(
        service.create('user-1', { quoteId: 'quote-1' }),
      ).rejects.toMatchObject({
        code: 'SALES_ORDER_ALREADY_EXISTS',
      } satisfies Partial<AppException>);
    });
  });

  describe('create: accountId + items ile (teklifsiz, manuel)', () => {
    it('siparisi kalemleriyle olusturur, audit log yazar ve cache invalidate eder', async () => {
      const salesOrderRow = createSalesOrderRow({
        quoteId: null,
        quote: null,
      });
      const prisma = createPrisma(salesOrderRow);
      const service = new SalesOrdersService(
        prisma as never,
        fakeAudit,
        fakeCache,
        fakeSurveyQueue,
        fakePostSaleCasesCache,
      );

      await service.create('user-1', {
        accountId: 'account-1',
        items: [{ productId: 'product-1', quantity: 2, unitPrice: 150 }],
      });

      expect(prisma.salesOrder.create).toHaveBeenCalledWith({
        data: {
          quoteId: null,
          accountId: 'account-1',
          contactId: null,
          orderNumber: expect.stringMatching(/^SAT-\d{4}-\d{2}-\d{2}-\d{3}$/),
          createdById: 'user-1',
          items: {
            create: [
              {
                productId: 'product-1',
                quantity: 2,
                unitPrice: 150,
                currency: 'TRY',
                discountPct: 0,
                vatPct: 0,
                brand: null,
              },
            ],
          },
        },
      });
      expect(auditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CREATE', entity: 'SalesOrder' }),
      );
      expect(cacheInvalidate).toHaveBeenCalled();
      expect(prisma.postSaleCase.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          salesOrderId: 'so-1',
          quoteId: null,
          accountId: 'account-1',
          contactId: null,
        }),
      });
    });

    it('firma bulunamazsa NOT_FOUND firlatir', async () => {
      const prisma = createPrisma();
      prisma.account.findFirst = vi.fn().mockResolvedValue(null);
      const service = new SalesOrdersService(
        prisma as never,
        fakeAudit,
        fakeCache,
        fakeSurveyQueue,
        fakePostSaleCasesCache,
      );

      await expect(
        service.create('user-1', {
          accountId: 'yok',
          items: [{ productId: 'product-1', quantity: 1, unitPrice: 10 }],
        }),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
      } satisfies Partial<AppException>);
    });

    it('urunlerden biri bulunamazsa PRODUCT_NOT_FOUND firlatir', async () => {
      const prisma = createPrisma();
      prisma.product.findMany = vi.fn().mockResolvedValue([]);
      const service = new SalesOrdersService(
        prisma as never,
        fakeAudit,
        fakeCache,
        fakeSurveyQueue,
        fakePostSaleCasesCache,
      );

      await expect(
        service.create('user-1', {
          accountId: 'account-1',
          items: [{ productId: 'yok', quantity: 1, unitPrice: 10 }],
        }),
      ).rejects.toMatchObject({
        code: 'PRODUCT_NOT_FOUND',
      } satisfies Partial<AppException>);
    });
  });
});
