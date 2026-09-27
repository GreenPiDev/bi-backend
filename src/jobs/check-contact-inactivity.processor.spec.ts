import { CheckContactInactivityProcessor } from './check-contact-inactivity.processor';

const TENANT_ID = 't1';

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function createStaleContact(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'c1',
    tenantId: TENANT_ID,
    firstName: 'Ayse',
    lastName: 'Yilmaz',
    ownerId: null,
    lastContactedAt: daysAgo(200),
    createdAt: daysAgo(300),
    inactivityNotifiedAt: null,
    ...overrides,
  };
}

function createPrisma(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    contact: {
      findMany: vi
        .fn()
        .mockResolvedValueOnce([{ tenantId: TENANT_ID }])
        .mockResolvedValueOnce([createStaleContact()]),
      update: vi.fn().mockResolvedValue({}),
    },
    tenantSetting: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    user: {
      findMany: vi.fn().mockResolvedValue([{ id: 'u1' }, { id: 'u2' }]),
    },
    notification: {
      create: vi.fn().mockResolvedValue({}),
    },
    ...overrides,
  };
}

function createRealtime() {
  return { emitToTenant: vi.fn() };
}

describe('CheckContactInactivityProcessor', () => {
  it("esigi asan aktif kisi icin tenant'taki tum aktif kullanicilara bildirim olusturur ve inactivityNotifiedAt gunceller", async () => {
    const prisma = createPrisma();
    const realtime = createRealtime();
    const processor = new CheckContactInactivityProcessor(
      prisma as never,
      realtime as never,
    );
    await processor.process();

    expect(prisma.notification.create).toHaveBeenCalledTimes(2);
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: TENANT_ID,
        recipientUserId: 'u1',
        type: 'CONTACT_INACTIVITY_ALERT',
        relatedEntityType: 'Contact',
        relatedEntityId: 'c1',
      }),
    });
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ recipientUserId: 'u2' }),
    });
    expect(realtime.emitToTenant).toHaveBeenCalledWith(
      TENANT_ID,
      'notifications.notification.created',
      { recipientUserId: 'u1' },
    );
    expect(realtime.emitToTenant).toHaveBeenCalledWith(
      TENANT_ID,
      'notifications.notification.created',
      { recipientUserId: 'u2' },
    );
    expect(prisma.contact.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { inactivityNotifiedAt: expect.any(Date) },
    });
  });

  it('daha once bildirim gonderilmis ve tarih guncellenmemisse tekrar gondermez', async () => {
    const prisma = createPrisma();
    prisma.contact.findMany = vi
      .fn()
      .mockResolvedValueOnce([{ tenantId: TENANT_ID }])
      .mockResolvedValueOnce([
        createStaleContact({ inactivityNotifiedAt: daysAgo(1) }),
      ]);
    const realtime = createRealtime();
    const processor = new CheckContactInactivityProcessor(
      prisma as never,
      realtime as never,
    );
    await processor.process();

    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it("kontagin sahibi olsa bile tenant'taki tum aktif kullanicilara bildirim gider", async () => {
    const prisma = createPrisma();
    prisma.contact.findMany = vi
      .fn()
      .mockResolvedValueOnce([{ tenantId: TENANT_ID }])
      .mockResolvedValueOnce([createStaleContact({ ownerId: 'u1' })]);
    const realtime = createRealtime();
    const processor = new CheckContactInactivityProcessor(
      prisma as never,
      realtime as never,
    );
    await processor.process();

    expect(prisma.notification.create).toHaveBeenCalledTimes(2);
  });

  it('bir tenant hata verirse digerlerini etkilemez', async () => {
    const prisma = createPrisma();
    prisma.contact.findMany = vi
      .fn()
      .mockResolvedValueOnce([{ tenantId: TENANT_ID }])
      .mockRejectedValueOnce(new Error('DB down'));
    const realtime = createRealtime();
    const processor = new CheckContactInactivityProcessor(
      prisma as never,
      realtime as never,
    );
    await expect(processor.process()).resolves.toBeUndefined();
  });
});
