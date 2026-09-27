import { CheckTodaysRemindersProcessor } from './check-todays-reminders.processor';

function createEvent(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'event-1',
    tenantId: 'tenant-1',
    attendees: [{ userId: 'user-1' }],
    ...overrides,
  };
}

function createPrisma(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    calendarEvent: {
      findMany: vi.fn().mockResolvedValue([createEvent()]),
    },
    notification: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
    },
    ...overrides,
  };
}

describe('CheckTodaysRemindersProcessor', () => {
  it('bugun etkinligi olan her katilimciya tek, toplu bir bildirim olusturur', async () => {
    const prisma = createPrisma();
    const emitToTenant = vi.fn();
    const processor = new CheckTodaysRemindersProcessor(
      prisma as never,
      {
        emitToTenant,
      } as never,
    );

    await processor.process();

    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-1',
          recipientUserId: 'user-1',
          type: 'CALENDAR_REMINDERS_DUE_TODAY',
          relatedEntityType: 'CalendarEvent',
        }),
      }),
    );
    expect(emitToTenant).toHaveBeenCalledWith(
      'tenant-1',
      'notifications.notification.created',
      { recipientUserId: 'user-1' },
    );
  });

  it('kullaniciya bugun icin ozel/tek basina bir hatirlatici bile olsa bildirir', async () => {
    const prisma = createPrisma({
      calendarEvent: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            createEvent({ attendees: [{ userId: 'creator-1' }] }),
          ]),
      },
    });
    const processor = new CheckTodaysRemindersProcessor(
      prisma as never,
      {
        emitToTenant: vi.fn(),
      } as never,
    );

    await processor.process();

    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ recipientUserId: 'creator-1' }),
      }),
    );
  });

  it('birden fazla etkinlik varsa tek bildirimde sayiyi toplar', async () => {
    const prisma = createPrisma({
      calendarEvent: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            createEvent({ id: 'event-1' }),
            createEvent({ id: 'event-2' }),
          ]),
      },
    });
    const processor = new CheckTodaysRemindersProcessor(
      prisma as never,
      {
        emitToTenant: vi.fn(),
      } as never,
    );

    await processor.process();

    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ title: expect.stringContaining('2') }),
      }),
    );
  });

  it('bugun icin zaten bir bildirim varsa tekrar olusturmaz (gunde en fazla 1 kez)', async () => {
    const prisma = createPrisma({
      notification: {
        findFirst: vi.fn().mockResolvedValue({ id: 'existing' }),
        create: vi.fn(),
      },
    });
    const processor = new CheckTodaysRemindersProcessor(
      prisma as never,
      {
        emitToTenant: vi.fn(),
      } as never,
    );

    await processor.process();

    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('bir kullanici hata verirse digerlerini etkilemez', async () => {
    const prisma = createPrisma({
      calendarEvent: {
        findMany: vi.fn().mockResolvedValue([createEvent()]),
      },
      notification: {
        findFirst: vi.fn().mockRejectedValueOnce(new Error('DB down')),
        create: vi.fn(),
      },
    });
    const processor = new CheckTodaysRemindersProcessor(
      prisma as never,
      {
        emitToTenant: vi.fn(),
      } as never,
    );

    await expect(processor.process()).resolves.toBeUndefined();
  });
});
