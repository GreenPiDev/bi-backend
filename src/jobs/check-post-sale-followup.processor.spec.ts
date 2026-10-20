import { CheckPostSaleFollowupProcessor } from './check-post-sale-followup.processor';

const fakePostSaleCasesCache = { invalidateForTenant: vi.fn() } as never;

function createDueCase(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'psc-1',
    tenantId: 'tenant-1',
    salesOrderId: 'so-1',
    account: { name: 'ACME' },
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
      }),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'user-1',
        email: 'satis@acme.com',
        isActive: true,
      }),
    },
    notification: {
      create: vi.fn().mockResolvedValue({}),
    },
    ...overrides,
  };
}

function createRealtime() {
  return { emitToTenant: vi.fn(), emitToAll: vi.fn() };
}

describe('CheckPostSaleFollowupProcessor', () => {
  it('vadesi gelmis ve hatirlatilmamis case icin in-app bildirim olusturur ve reminderSentAt gunceller', async () => {
    const prisma = createPrisma();
    const realtime = createRealtime();
    const processor = new CheckPostSaleFollowupProcessor(
      prisma as never,
      realtime as never,
      fakePostSaleCasesCache,
    );
    await processor.process();

    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-1',
          recipientUserId: 'user-1',
          type: 'POST_SALE_SURVEY_REMINDER',
          title: expect.stringContaining('ACME'),
          relatedEntityType: 'PostSaleCase',
          relatedEntityId: 'psc-1',
        }),
      }),
    );
    expect(realtime.emitToTenant).toHaveBeenCalledWith(
      'tenant-1',
      'notifications.notification.created',
      { recipientUserId: 'user-1' },
    );
    expect(prisma.postSaleCase.update).toHaveBeenCalledWith({
      where: { id: 'psc-1' },
      data: { reminderSentAt: expect.any(Date) },
    });
  });

  it('teklifsiz (manuel) siparis icin de bildirim olusturur', async () => {
    const prisma = createPrisma();
    const realtime = createRealtime();
    const processor = new CheckPostSaleFollowupProcessor(
      prisma as never,
      realtime as never,
      fakePostSaleCasesCache,
    );
    await processor.process();

    expect(prisma.notification.create).toHaveBeenCalled();
  });

  it('satis temsilcisi pasifse bildirim olusturmaz', async () => {
    const prisma = createPrisma();
    prisma.user.findUnique = vi.fn().mockResolvedValue({
      id: 'user-1',
      email: 'x@acme.com',
      isActive: false,
    });
    const realtime = createRealtime();
    const processor = new CheckPostSaleFollowupProcessor(
      prisma as never,
      realtime as never,
      fakePostSaleCasesCache,
    );
    await processor.process();

    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('bir case hata verirse digerlerini etkilemez', async () => {
    const prisma = createPrisma();
    prisma.salesOrder.findUnique = vi
      .fn()
      .mockRejectedValue(new Error('DB down'));
    const realtime = createRealtime();
    const processor = new CheckPostSaleFollowupProcessor(
      prisma as never,
      realtime as never,
      fakePostSaleCasesCache,
    );
    await expect(processor.process()).resolves.toBeUndefined();
  });
});
