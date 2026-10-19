import { CheckPostSaleFollowupProcessor } from './check-post-sale-followup.processor';

const fakePostSaleCasesCache = { invalidateForTenant: vi.fn() } as never;

function createDueCase(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'psc-1',
    tenantId: 'tenant-1',
    salesOrderId: 'so-1',
    quoteId: 'quote-1',
    reminderAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    reminderSentAt: null,
    ...overrides,
  };
}

function createPrisma(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    postSaleCase: {
      findMany: vi.fn().mockResolvedValue([createDueCase()]),
      update: vi.fn().mockResolvedValue({}),
    },
    salesOrder: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'so-1',
        orderNumber: 'SAT-2026-10-19-001',
        createdById: 'user-1',
        quote: { quoteNumber: 'TEK-2026-09-06-001' },
      }),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'user-1',
        email: 'satis@acme.com',
        isActive: true,
      }),
    },
    ...overrides,
  };
}

describe('CheckPostSaleFollowupProcessor', () => {
  it('vadesi gelmis ve hatirlatilmamis case icin e-posta gonderir ve reminderSentAt gunceller', async () => {
    const prisma = createPrisma();
    const mail = { send: vi.fn().mockResolvedValue(undefined) };
    const processor = new CheckPostSaleFollowupProcessor(
      prisma as never,
      mail as never,
      fakePostSaleCasesCache,
    );
    await processor.process();

    expect(mail.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: ['satis@acme.com'] }),
    );
    expect(prisma.postSaleCase.update).toHaveBeenCalledWith({
      where: { id: 'psc-1' },
      data: { reminderSentAt: expect.any(Date) },
    });
  });

  it('teklifsiz (manuel) siparis icin de e-posta gonderir', async () => {
    const prisma = createPrisma();
    prisma.salesOrder.findUnique = vi.fn().mockResolvedValue({
      id: 'so-1',
      orderNumber: 'SAT-2026-10-19-001',
      createdById: 'user-1',
      quote: null,
    });
    const mail = { send: vi.fn().mockResolvedValue(undefined) };
    const processor = new CheckPostSaleFollowupProcessor(
      prisma as never,
      mail as never,
      fakePostSaleCasesCache,
    );
    await processor.process();

    expect(mail.send).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: expect.stringContaining('SAT-2026-10-19-001'),
      }),
    );
  });

  it('satis temsilcisi pasifse gondermez', async () => {
    const prisma = createPrisma();
    prisma.user.findUnique = vi.fn().mockResolvedValue({
      id: 'user-1',
      email: 'x@acme.com',
      isActive: false,
    });
    const mail = { send: vi.fn().mockResolvedValue(undefined) };
    const processor = new CheckPostSaleFollowupProcessor(
      prisma as never,
      mail as never,
      fakePostSaleCasesCache,
    );
    await processor.process();

    expect(mail.send).not.toHaveBeenCalled();
  });

  it('bir case hata verirse digerlerini etkilemez', async () => {
    const prisma = createPrisma();
    prisma.salesOrder.findUnique = vi
      .fn()
      .mockRejectedValue(new Error('DB down'));
    const mail = { send: vi.fn().mockResolvedValue(undefined) };
    const processor = new CheckPostSaleFollowupProcessor(
      prisma as never,
      mail as never,
      fakePostSaleCasesCache,
    );
    await expect(processor.process()).resolves.toBeUndefined();
  });
});
