import { SendInteractionRemindersProcessor } from './send-interaction-reminders.processor';

function createAttendee(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'attendee-1',
    userId: 'user-1',
    note: 'sunumu hazirla',
    event: {
      id: 'event-1',
      title: 'Hatirlatma: musteri arayacagiz',
      relatedEntityId: 'interaction-1',
      attendees: [{ userId: 'user-1' }],
    },
    ...overrides,
  };
}

function createPrisma(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    calendarEventAttendee: {
      findMany: vi.fn().mockResolvedValue([createAttendee()]),
      update: vi.fn().mockResolvedValue({}),
    },
    interaction: {
      findFirst: vi
        .fn()
        .mockResolvedValue({ id: 'interaction-1', status: 'OPEN' }),
    },
    user: {
      findFirst: vi.fn().mockResolvedValue({ email: 'user1@acme.com' }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    ...overrides,
  };
}

describe('SendInteractionRemindersProcessor', () => {
  it('acik gorusme icin e-posta gonderir ve notifiedAt damgalar', async () => {
    const prisma = createPrisma();
    const mail = { send: vi.fn().mockResolvedValue(undefined) };
    const processor = new SendInteractionRemindersProcessor(
      prisma as never,
      mail as never,
    );
    await processor.process();

    expect(mail.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: ['user1@acme.com'] }),
    );
    expect(prisma.calendarEventAttendee.update).toHaveBeenCalledWith({
      where: { id: 'attendee-1' },
      data: { notifiedAt: expect.any(Date) },
    });
  });

  it('M8: gorusme kapaliysa e-posta gondermez', async () => {
    const prisma = createPrisma();
    prisma.interaction.findFirst = vi
      .fn()
      .mockResolvedValue({ id: 'interaction-1', status: 'CLOSED' });
    const mail = { send: vi.fn().mockResolvedValue(undefined) };
    const processor = new SendInteractionRemindersProcessor(
      prisma as never,
      mail as never,
    );
    await processor.process();

    expect(mail.send).not.toHaveBeenCalled();
    expect(prisma.calendarEventAttendee.update).not.toHaveBeenCalled();
  });

  it('M4: diger katilimcilari CC olarak ekler', async () => {
    const prisma = createPrisma({
      calendarEventAttendee: {
        findMany: vi.fn().mockResolvedValue([
          createAttendee({
            event: {
              id: 'event-1',
              title: 'Toplanti hatirlatmasi',
              relatedEntityId: 'interaction-1',
              attendees: [{ userId: 'user-1' }, { userId: 'user-2' }],
            },
          }),
        ]),
        update: vi.fn().mockResolvedValue({}),
      },
    });
    prisma.user.findMany = vi
      .fn()
      .mockResolvedValue([{ email: 'user2@acme.com' }]);
    const mail = { send: vi.fn().mockResolvedValue(undefined) };
    const processor = new SendInteractionRemindersProcessor(
      prisma as never,
      mail as never,
    );
    await processor.process();

    expect(mail.send).toHaveBeenCalledWith(
      expect.objectContaining({ cc: ['user2@acme.com'] }),
    );
  });

  it('bir attendee hata verirse digerlerini etkilemez', async () => {
    const prisma = createPrisma();
    prisma.interaction.findFirst = vi
      .fn()
      .mockRejectedValueOnce(new Error('DB down'));
    const mail = { send: vi.fn().mockResolvedValue(undefined) };
    const processor = new SendInteractionRemindersProcessor(
      prisma as never,
      mail as never,
    );
    await expect(processor.process()).resolves.toBeUndefined();
  });
});
