import { AppException } from '../../core/errors/app.exception';
import { InteractionsService } from './interactions.service';

const auditLog = vi.fn();
const fakeAudit = { log: auditLog } as never;

const TENANT_ID = 'tenant-1';
const USER_ID = '22222222-2222-2222-2222-222222222222';
const ACCOUNT_ID = '33333333-3333-3333-3333-333333333333';

function createInteractionRow(
  overrides: Partial<Record<string, unknown>> = {},
) {
  return {
    id: 'interaction-1',
    accountId: ACCOUNT_ID,
    contactId: null,
    account: { id: ACCOUNT_ID, name: 'Acme' },
    contact: null,
    participants: [],
    opportunity: null,
    ...overrides,
  };
}

function createPrisma(interactionRow: unknown = createInteractionRow()) {
  const client = {
    account: {
      create: vi.fn().mockResolvedValue({ id: ACCOUNT_ID, name: 'Yeni Firma' }),
    },
    contact: {
      create: vi.fn().mockResolvedValue({ id: 'contact-1' }),
      findUnique: vi.fn().mockResolvedValue({ accountId: ACCOUNT_ID }),
    },
    interaction: {
      findFirst: vi.fn().mockResolvedValue(interactionRow),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue(interactionRow),
      update: vi.fn().mockResolvedValue(interactionRow),
      delete: vi.fn().mockResolvedValue(interactionRow),
    },
    opportunity: {
      create: vi.fn().mockResolvedValue({ id: 'opp-1' }),
    },
    calendarEvent: {
      create: vi.fn().mockResolvedValue({ id: 'event-1' }),
    },
    calendarEventAttendee: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(client)),
  };
  return client;
}

describe('InteractionsService', () => {
  it('getById: bulunamayan gorusme icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma(null);
    const service = new InteractionsService(prisma as never, fakeAudit);
    await expect(service.getById('yok')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<AppException>);
  });

  it('create: accountId verilmisse yeni cari olusturmaz', async () => {
    const prisma = createPrisma();
    const service = new InteractionsService(prisma as never, fakeAudit);
    await service.create(TENANT_ID, USER_ID, {
      accountId: ACCOUNT_ID,
      type: 'CALL',
      notes: 'Görüşme notu',
      occurredAt: new Date('2026-01-01'),
    } as never);
    expect(prisma.account.create).not.toHaveBeenCalled();
    expect(prisma.interaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          accountId: ACCOUNT_ID,
          accountAutoCreated: false,
        }),
      }),
    );
  });

  it('create: M2 - accountName verilmisse otomatik cari olusturur ve isaretler', async () => {
    const prisma = createPrisma();
    const service = new InteractionsService(prisma as never, fakeAudit);
    await service.create(TENANT_ID, USER_ID, {
      accountName: 'Yeni Firma',
      type: 'VISIT',
      notes: 'Ziyaret notu',
      occurredAt: new Date('2026-01-01'),
    } as never);
    expect(prisma.account.create).toHaveBeenCalledWith({
      data: { name: 'Yeni Firma' },
    });
    expect(prisma.interaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ accountAutoCreated: true }),
      }),
    );
  });

  it('create: M1 - contactName verilmisse otomatik kontak olusturur', async () => {
    const prisma = createPrisma();
    const service = new InteractionsService(prisma as never, fakeAudit);
    await service.create(TENANT_ID, USER_ID, {
      accountId: ACCOUNT_ID,
      contactName: 'Ahmet Yilmaz',
      type: 'CALL',
      notes: 'notlar',
      occurredAt: new Date('2026-01-01'),
    } as never);
    expect(prisma.contact.create).toHaveBeenCalledWith({
      data: { accountId: ACCOUNT_ID, firstName: 'Ahmet', lastName: 'Yilmaz' },
    });
  });

  it('create: firma bos, mevcut contactId verilmisse firma o kisinin carisinden alinir', async () => {
    const prisma = createPrisma();
    const service = new InteractionsService(prisma as never, fakeAudit);
    await service.create(TENANT_ID, USER_ID, {
      contactId: 'contact-1',
      type: 'CALL',
      notes: 'notlar',
      occurredAt: new Date('2026-01-01'),
    } as never);
    expect(prisma.contact.findUnique).toHaveBeenCalledWith({
      where: { id: 'contact-1' },
      select: { accountId: true },
    });
    expect(prisma.interaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          accountId: ACCOUNT_ID,
          contactId: 'contact-1',
        }),
      }),
    );
  });

  it('create: firma bos, yeni contactName verilmisse firmasiz kisi olusturur', async () => {
    const prisma = createPrisma();
    prisma.contact.findUnique = vi.fn().mockResolvedValue({ accountId: null });
    const service = new InteractionsService(prisma as never, fakeAudit);
    await service.create(TENANT_ID, USER_ID, {
      contactName: 'Ahmet Yilmaz',
      type: 'CALL',
      notes: 'notlar',
      occurredAt: new Date('2026-01-01'),
    } as never);
    expect(prisma.contact.create).toHaveBeenCalledWith({
      data: { accountId: undefined, firstName: 'Ahmet', lastName: 'Yilmaz' },
    });
    expect(prisma.interaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ accountId: undefined }),
      }),
    );
  });

  it('create: firma yokken opportunity istenirse VALIDATION_ERROR firlatir', async () => {
    const prisma = createPrisma();
    prisma.contact.findUnique = vi.fn().mockResolvedValue({ accountId: null });
    const service = new InteractionsService(prisma as never, fakeAudit);
    await expect(
      service.create(TENANT_ID, USER_ID, {
        contactName: 'Ahmet Yilmaz',
        type: 'CALL',
        notes: 'notlar',
        occurredAt: new Date('2026-01-01'),
        opportunity: { name: 'Yeni sunucu ihtiyaci' },
      } as never),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(prisma.opportunity.create).not.toHaveBeenCalled();
  });

  it('create: M3/O1 - opportunity verilmisse gomulu firsat olusturur ve baglar', async () => {
    const prisma = createPrisma();
    const service = new InteractionsService(prisma as never, fakeAudit);
    await service.create(TENANT_ID, USER_ID, {
      accountId: ACCOUNT_ID,
      type: 'MEETING',
      notes: 'notlar',
      occurredAt: new Date('2026-01-01'),
      opportunity: { name: 'Yeni sunucu ihtiyaci' },
    } as never);
    expect(prisma.opportunity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          interactionId: 'interaction-1',
          name: 'Yeni sunucu ihtiyaci',
        }),
      }),
    );
  });

  it('create: M9 - gecmis tarihli hatirlatma REMINDER_PAST_DATE firlatir', async () => {
    const prisma = createPrisma();
    const service = new InteractionsService(prisma as never, fakeAudit);
    await expect(
      service.create(TENANT_ID, USER_ID, {
        accountId: ACCOUNT_ID,
        type: 'CALL',
        notes: 'notlar',
        occurredAt: new Date('2020-01-01'),
        reminder: {
          startAt: new Date('2020-01-01'),
          assignees: [{ userId: USER_ID }],
        },
      } as never),
    ).rejects.toMatchObject({ code: 'REMINDER_PAST_DATE' });
    expect(prisma.calendarEvent.create).not.toHaveBeenCalled();
  });

  it('create: M4-M6 - cakisma yoksa hatirlatma etkinligi ve katilimcilari olusturur', async () => {
    const prisma = createPrisma();
    const service = new InteractionsService(prisma as never, fakeAudit);
    const startAt = new Date(Date.now() + 60 * 60_000);
    const result = await service.create(TENANT_ID, USER_ID, {
      accountId: ACCOUNT_ID,
      type: 'CALL',
      notes: 'notlar',
      occurredAt: new Date('2026-01-01'),
      reminder: { startAt, assignees: [{ userId: USER_ID, note: 'hazirlan' }] },
    } as never);
    expect(prisma.calendarEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          relatedEntityType: 'Interaction',
          relatedEntityId: 'interaction-1',
          attendees: { create: [{ userId: USER_ID, note: 'hazirlan' }] },
        }),
      }),
    );
    expect(result.reminderConflicts).toEqual([]);
  });

  it('create: M7 - cakisan kullanici icin reminderConflicts doner', async () => {
    const prisma = createPrisma();
    prisma.calendarEventAttendee.findFirst = vi
      .fn()
      .mockResolvedValueOnce({ id: 'attendee-1' }) // ilk denemede meslgul
      .mockResolvedValue(null); // sonraki oneri slotu bos
    const service = new InteractionsService(prisma as never, fakeAudit);
    const startAt = new Date(Date.now() + 60 * 60_000);
    const result = await service.create(TENANT_ID, USER_ID, {
      accountId: ACCOUNT_ID,
      type: 'CALL',
      notes: 'notlar',
      occurredAt: new Date('2026-01-01'),
      reminder: { startAt, assignees: [{ userId: USER_ID }] },
    } as never);
    expect(result.reminderConflicts).toEqual([
      { userId: USER_ID, suggestedStartAt: expect.any(Date) },
    ]);
  });

  it('remove: gorusmeyi siler ve audit log yazar', async () => {
    const prisma = createPrisma();
    const service = new InteractionsService(prisma as never, fakeAudit);
    await service.remove('interaction-1');
    expect(prisma.interaction.delete).toHaveBeenCalledWith({
      where: { id: 'interaction-1' },
    });
  });
});
