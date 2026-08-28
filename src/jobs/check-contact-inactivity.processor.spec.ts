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
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([{ email: 'admin@acme.com' }]),
    },
    ...overrides,
  };
}

describe('CheckContactInactivityProcessor', () => {
  it('esigi asan aktif kisi icin e-posta gonderir ve inactivityNotifiedAt gunceller', async () => {
    const prisma = createPrisma();
    const mail = { send: vi.fn().mockResolvedValue(undefined) };
    const processor = new CheckContactInactivityProcessor(
      prisma as never,
      mail as never,
    );
    await processor.process();

    expect(mail.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: ['admin@acme.com'] }),
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
    const mail = { send: vi.fn().mockResolvedValue(undefined) };
    const processor = new CheckContactInactivityProcessor(
      prisma as never,
      mail as never,
    );
    await processor.process();

    expect(mail.send).not.toHaveBeenCalled();
  });

  it('sahibi varsa sadece sahibine gonderir', async () => {
    const prisma = createPrisma();
    prisma.contact.findMany = vi
      .fn()
      .mockResolvedValueOnce([{ tenantId: TENANT_ID }])
      .mockResolvedValueOnce([createStaleContact({ ownerId: 'u1' })]);
    prisma.user.findFirst = vi
      .fn()
      .mockResolvedValue({ email: 'owner@acme.com' });
    const mail = { send: vi.fn().mockResolvedValue(undefined) };
    const processor = new CheckContactInactivityProcessor(
      prisma as never,
      mail as never,
    );
    await processor.process();

    expect(mail.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: ['owner@acme.com'] }),
    );
  });

  it('bir tenant hata verirse digerlerini etkilemez', async () => {
    const prisma = createPrisma();
    prisma.contact.findMany = vi
      .fn()
      .mockResolvedValueOnce([{ tenantId: TENANT_ID }])
      .mockRejectedValueOnce(new Error('DB down'));
    const mail = { send: vi.fn().mockResolvedValue(undefined) };
    const processor = new CheckContactInactivityProcessor(
      prisma as never,
      mail as never,
    );
    await expect(processor.process()).resolves.toBeUndefined();
  });
});
