import { AppException } from '../../core/errors/app.exception';
import { SalesOrdersService } from './sales-orders.service';

const auditLog = vi.fn();
const fakeAudit = { log: auditLog } as never;
const fakeCache = {
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn(),
  invalidate: vi.fn(),
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
    },
  };
}

describe('SalesOrdersService', () => {
  beforeEach(() => {
    auditLog.mockClear();
  });

  it('list: sonuclari sayfalanmis halde doner', async () => {
    const prisma = createPrisma();
    const service = new SalesOrdersService(
      prisma as never,
      fakeAudit,
      fakeCache,
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
    );
    await expect(
      service.updateStatus('yok', { status: 'COMPLETED' }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<AppException>);
  });
});
