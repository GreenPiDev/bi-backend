import { AppException } from '../../core/errors/app.exception';
import { CalendarEventsService } from './calendar-events.service';

const fakeAudit = { log: vi.fn() } as never;
const fakeFileUrl = { build: vi.fn(() => null) } as never;
const fakeCalendarEventsCache = {
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn(),
  getPendingInvites: vi.fn().mockResolvedValue(null),
  setPendingInvites: vi.fn(),
  invalidate: vi.fn(),
} as never;
const fakeRealtime = { emitToTenant: vi.fn() } as never;
const fakeNotifications = { create: vi.fn() } as never;
const fakeCalendarShares = {
  canView: vi.fn().mockResolvedValue(true),
} as never;

const EVENT_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = '22222222-2222-2222-2222-222222222222';

function createEventRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: EVENT_ID,
    title: 'Musteri ziyareti',
    startAt: new Date('2026-09-10T10:00:00.000Z'),
    endAt: new Date('2026-09-10T11:00:00.000Z'),
    allDay: false,
    createdById: USER_ID,
    attendees: [],
    ...overrides,
  };
}

function attendeeRow(
  userId: string,
  overrides: Partial<Record<string, unknown>> = {},
) {
  return {
    id: `attendee-${userId}`,
    userId,
    note: null,
    status: 'ACCEPTED',
    responseNote: null,
    respondedAt: new Date('2026-09-01T00:00:00.000Z'),
    ...overrides,
  };
}

function createPrisma(eventRow: unknown = createEventRow()) {
  const client = {
    user: {
      findMany: vi
        .fn()
        .mockImplementation(
          async (args: { where?: { id?: { in?: string[] } } } = {}) => {
            const ids = args.where?.id?.in;
            if (!ids) {
              return [
                {
                  id: USER_ID,
                  name: 'Ayse Yilmaz',
                  avatarKey: null,
                  updatedAt: new Date('2026-09-01T00:00:00.000Z'),
                },
              ];
            }
            return ids.map((id) => ({
              id,
              name: 'Ayse Yilmaz',
              avatarKey: null,
              updatedAt: new Date('2026-09-01T00:00:00.000Z'),
            }));
          },
        ),
      findFirst: vi.fn().mockResolvedValue({ name: 'Ayse Yilmaz' }),
    },
    calendarEvent: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(eventRow),
      create: vi.fn().mockResolvedValue(eventRow),
      update: vi.fn().mockResolvedValue(eventRow),
      delete: vi.fn().mockResolvedValue(eventRow),
    },
    calendarEventAttendee: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
    },
    $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(client)),
  };
  return client;
}

function makeService(
  prisma: unknown,
  overrides: Partial<{
    realtime: unknown;
    notifications: unknown;
    calendarShares: unknown;
  }> = {},
) {
  return new CalendarEventsService(
    prisma as never,
    fakeAudit,
    fakeFileUrl,
    fakeCalendarEventsCache,
    (overrides.realtime ?? fakeRealtime) as never,
    (overrides.notifications ?? fakeNotifications) as never,
    (overrides.calendarShares ?? fakeCalendarShares) as never,
  );
}

describe('CalendarEventsService', () => {
  it('getById: bulunamayan etkinlik icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma(null);
    const service = makeService(prisma);
    await expect(service.getById('yok', USER_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<AppException>);
  });

  it('create: attendee verilmezse olusturan kullaniciyi ACCEPTED tek katilimci olarak ekler', async () => {
    const prisma = createPrisma();
    const service = makeService(prisma);
    await service.create('tenant-1', USER_ID, {
      title: 'Musteri ziyareti',
      startAt: new Date('2026-09-10T10:00:00.000Z'),
      endAt: new Date('2026-09-10T11:00:00.000Z'),
    } as never);
    expect(prisma.calendarEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          attendees: {
            create: [
              expect.objectContaining({
                userId: USER_ID,
                status: 'ACCEPTED',
                respondedAt: expect.any(Date),
              }),
            ],
          },
        }),
      }),
    );
  });

  it('create: diger katilimcilar PENDING olarak eklenir ve davet bildirimi gider', async () => {
    const OTHER_USER_ID = '33333333-3333-3333-3333-333333333333';
    const createdEvent = createEventRow({
      attendees: [
        attendeeRow(USER_ID, { status: 'ACCEPTED' }),
        attendeeRow(OTHER_USER_ID, { status: 'PENDING' }),
      ],
    });
    const prisma = createPrisma(createdEvent);
    const notifications = { create: vi.fn() } as never;
    const service = makeService(prisma, { notifications });
    await service.create('tenant-1', USER_ID, {
      title: 'Musteri ziyareti',
      startAt: new Date('2026-09-10T10:00:00.000Z'),
      endAt: new Date('2026-09-10T11:00:00.000Z'),
      attendees: [
        { userId: USER_ID },
        { userId: OTHER_USER_ID, note: 'sunumu hazirla' },
      ],
    } as never);
    expect(prisma.calendarEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          attendees: {
            create: [
              expect.objectContaining({ userId: USER_ID, status: 'ACCEPTED' }),
              expect.objectContaining({
                userId: OTHER_USER_ID,
                note: 'sunumu hazirla',
                status: 'PENDING',
              }),
            ],
          },
        }),
      }),
    );
    expect(
      (notifications as { create: ReturnType<typeof vi.fn> }).create,
    ).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({
        recipientUserId: OTHER_USER_ID,
        type: 'CALENDAR_EVENT_INVITE',
      }),
    );
  });

  it('update: bulunamayan etkinlik icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma(null);
    const service = makeService(prisma);
    await expect(
      service.update('yok', { title: 'x' } as never, 'tenant-1'),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('update: yeni eklenen katilimci PENDING olarak eklenir, mevcutlarin durumu korunur', async () => {
    const OTHER_USER_ID = '33333333-3333-3333-3333-333333333333';
    const NEW_USER_ID = '44444444-4444-4444-4444-444444444444';
    const before = createEventRow({
      attendees: [
        attendeeRow(USER_ID, { status: 'ACCEPTED' }),
        attendeeRow(OTHER_USER_ID, { status: 'ACCEPTED' }),
      ],
    });
    const prisma = createPrisma(before);
    const notifications = { create: vi.fn() } as never;
    const service = makeService(prisma, { notifications });

    await service.update(
      EVENT_ID,
      {
        attendees: [
          { userId: USER_ID },
          { userId: OTHER_USER_ID },
          { userId: NEW_USER_ID },
        ],
      } as never,
      'tenant-1',
    );

    // Var olan iki katilimciya dokunulmadi (silinmedi/yeniden yaratilmadi).
    expect(prisma.calendarEventAttendee.deleteMany).not.toHaveBeenCalled();
    expect(prisma.calendarEventAttendee.create).toHaveBeenCalledTimes(1);
    expect(prisma.calendarEventAttendee.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: NEW_USER_ID,
        status: 'PENDING',
      }),
    });
    expect(
      (notifications as { create: ReturnType<typeof vi.fn> }).create,
    ).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({
        recipientUserId: NEW_USER_ID,
        type: 'CALENDAR_EVENT_INVITE',
      }),
    );
  });

  it('update: listeden cikan katilimci silinir', async () => {
    const OTHER_USER_ID = '33333333-3333-3333-3333-333333333333';
    const before = createEventRow({
      attendees: [
        attendeeRow(USER_ID, { status: 'ACCEPTED' }),
        attendeeRow(OTHER_USER_ID, { status: 'ACCEPTED' }),
      ],
    });
    const prisma = createPrisma(before);
    const service = makeService(prisma);

    await service.update(
      EVENT_ID,
      { attendees: [{ userId: USER_ID }] } as never,
      'tenant-1',
    );

    expect(prisma.calendarEventAttendee.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: [`attendee-${OTHER_USER_ID}`] } },
    });
  });

  it('update: attendees verilmezse mevcut katilimcilara dokunmaz', async () => {
    const prisma = createPrisma();
    const service = makeService(prisma);
    await service.update(
      EVENT_ID,
      { title: 'Yeni baslik' } as never,
      'tenant-1',
    );
    expect(prisma.calendarEventAttendee.deleteMany).not.toHaveBeenCalled();
    expect(prisma.calendarEventAttendee.create).not.toHaveBeenCalled();
  });

  it('update: saat degisince ACCEPTED katilimcilara guncelleme bildirimi gider, editoru haric tutulur', async () => {
    const OTHER_USER_ID = '33333333-3333-3333-3333-333333333333';
    const before = createEventRow({
      attendees: [
        attendeeRow(USER_ID, { status: 'ACCEPTED' }),
        attendeeRow(OTHER_USER_ID, { status: 'ACCEPTED' }),
      ],
    });
    const updated = createEventRow({
      startAt: new Date('2026-09-11T10:00:00.000Z'),
      endAt: new Date('2026-09-11T11:00:00.000Z'),
      attendees: [
        attendeeRow(USER_ID, { status: 'ACCEPTED' }),
        attendeeRow(OTHER_USER_ID, { status: 'ACCEPTED' }),
      ],
    });
    const prisma = createPrisma(before);
    prisma.calendarEvent.update = vi.fn().mockResolvedValue(updated);
    const notifications = { create: vi.fn() } as never;
    const service = makeService(prisma, { notifications });

    await service.update(
      EVENT_ID,
      {
        startAt: new Date('2026-09-11T10:00:00.000Z'),
        endAt: new Date('2026-09-11T11:00:00.000Z'),
      } as never,
      'tenant-1',
      USER_ID,
    );

    expect(
      (notifications as { create: ReturnType<typeof vi.fn> }).create,
    ).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({
        recipientUserId: OTHER_USER_ID,
        type: 'CALENDAR_EVENT_UPDATED',
      }),
    );
    expect(
      (notifications as { create: ReturnType<typeof vi.fn> }).create,
    ).not.toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ recipientUserId: USER_ID }),
    );
  });

  it('respond: kendi PENDING satirini ACCEPTED yapar ve olusturana bildirim gonderir', async () => {
    const OTHER_USER_ID = '33333333-3333-3333-3333-333333333333';
    const event = createEventRow({
      attendees: [
        attendeeRow(USER_ID, { status: 'ACCEPTED' }),
        attendeeRow(OTHER_USER_ID, { status: 'PENDING', respondedAt: null }),
      ],
    });
    const prisma = createPrisma(event);
    const notifications = { create: vi.fn() } as never;
    const service = makeService(prisma, { notifications });

    await service.respond(EVENT_ID, 'tenant-1', OTHER_USER_ID, {
      status: 'ACCEPTED',
    } as never);

    expect(prisma.calendarEventAttendee.update).toHaveBeenCalledWith({
      where: { id: `attendee-${OTHER_USER_ID}` },
      data: expect.objectContaining({ status: 'ACCEPTED', responseNote: null }),
    });
    expect(
      (notifications as { create: ReturnType<typeof vi.fn> }).create,
    ).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({
        recipientUserId: USER_ID,
        type: 'CALENDAR_EVENT_RESPONSE',
      }),
    );
  });

  it('respond: kabul ederken opsiyonel not girilirse kaydedilir ve bildirim govdesine gider', async () => {
    const OTHER_USER_ID = '33333333-3333-3333-3333-333333333333';
    const event = createEventRow({
      attendees: [
        attendeeRow(USER_ID, { status: 'ACCEPTED' }),
        attendeeRow(OTHER_USER_ID, { status: 'PENDING', respondedAt: null }),
      ],
    });
    const prisma = createPrisma(event);
    const notifications = { create: vi.fn() } as never;
    const service = makeService(prisma, { notifications });

    await service.respond(EVENT_ID, 'tenant-1', OTHER_USER_ID, {
      status: 'ACCEPTED',
      responseNote: 'Memnuniyetle katilirim',
    } as never);

    expect(prisma.calendarEventAttendee.update).toHaveBeenCalledWith({
      where: { id: `attendee-${OTHER_USER_ID}` },
      data: expect.objectContaining({
        status: 'ACCEPTED',
        responseNote: 'Memnuniyetle katilirim',
      }),
    });
    expect(
      (notifications as { create: ReturnType<typeof vi.fn> }).create,
    ).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({
        recipientUserId: USER_ID,
        type: 'CALENDAR_EVENT_RESPONSE',
        body: 'Memnuniyetle katilirim',
      }),
    );
  });

  it('respond: reddederken responseNote kaydedilir ve bildirim govdesine gider', async () => {
    const OTHER_USER_ID = '33333333-3333-3333-3333-333333333333';
    const event = createEventRow({
      attendees: [
        attendeeRow(USER_ID, { status: 'ACCEPTED' }),
        attendeeRow(OTHER_USER_ID, { status: 'PENDING', respondedAt: null }),
      ],
    });
    const prisma = createPrisma(event);
    const notifications = { create: vi.fn() } as never;
    const service = makeService(prisma, { notifications });

    await service.respond(EVENT_ID, 'tenant-1', OTHER_USER_ID, {
      status: 'DECLINED',
      responseNote: 'O saatte baska bir toplantim var',
    } as never);

    expect(prisma.calendarEventAttendee.update).toHaveBeenCalledWith({
      where: { id: `attendee-${OTHER_USER_ID}` },
      data: expect.objectContaining({
        status: 'DECLINED',
        responseNote: 'O saatte baska bir toplantim var',
      }),
    });
    expect(
      (notifications as { create: ReturnType<typeof vi.fn> }).create,
    ).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({
        recipientUserId: USER_ID,
        type: 'CALENDAR_EVENT_RESPONSE',
        body: 'O saatte baska bir toplantim var',
      }),
    );
  });

  it('respond: olusturan kendi etkinligine yanit veremez', async () => {
    const event = createEventRow({
      attendees: [attendeeRow(USER_ID, { status: 'ACCEPTED' })],
    });
    const prisma = createPrisma(event);
    const service = makeService(prisma);
    await expect(
      service.respond(EVENT_ID, 'tenant-1', USER_ID, {
        status: 'ACCEPTED',
      } as never),
    ).rejects.toMatchObject({ code: 'CANNOT_RESPOND_TO_OWN_EVENT' });
  });

  it('respond: katilimci olmayan kullanici icin NOT_FOUND firlatir', async () => {
    const OTHER_USER_ID = '33333333-3333-3333-3333-333333333333';
    const event = createEventRow({
      attendees: [attendeeRow(USER_ID, { status: 'ACCEPTED' })],
    });
    const prisma = createPrisma(event);
    const service = makeService(prisma);
    await expect(
      service.respond(EVENT_ID, 'tenant-1', OTHER_USER_ID, {
        status: 'ACCEPTED',
      } as never),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('remove: etkinligi siler ve audit log yazar', async () => {
    const prisma = createPrisma();
    const service = makeService(prisma);
    await service.remove(EVENT_ID, 'tenant-1', USER_ID);
    expect(prisma.calendarEvent.delete).toHaveBeenCalledWith({
      where: { id: EVENT_ID },
    });
  });

  it('remove: olusturan olmayan kullanici icin NOT_EVENT_CREATOR firlatir', async () => {
    const OTHER_USER_ID = '33333333-3333-3333-3333-333333333333';
    const prisma = createPrisma();
    const service = makeService(prisma);
    await expect(
      service.remove(EVENT_ID, 'tenant-1', OTHER_USER_ID),
    ).rejects.toMatchObject({ code: 'NOT_EVENT_CREATOR' });
    expect(prisma.calendarEvent.delete).not.toHaveBeenCalled();
  });

  it('listAssignableUsers: aktif kullanicilari isim/id/avatarUrl ile doner', async () => {
    const prisma = createPrisma();
    const service = makeService(prisma);
    const result = await service.listAssignableUsers();
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { isActive: true, isPlatformAdmin: false },
      select: { id: true, name: true, avatarKey: true, updatedAt: true },
      orderBy: { name: 'asc' },
    });
    expect(result).toEqual([
      { id: USER_ID, name: 'Ayse Yilmaz', avatarUrl: null },
    ]);
  });

  it('list: from/to araligini ortusme sorgusuna cevirir', async () => {
    const prisma = createPrisma();
    const from = new Date('2026-09-01T00:00:00.000Z');
    const to = new Date('2026-09-30T23:59:59.000Z');
    const service = makeService(prisma);
    await service.list({ from, to, order: 'asc' } as never, USER_ID);
    expect(prisma.calendarEvent.findMany).toHaveBeenCalledWith({
      where: { startAt: { lte: to }, endAt: { gte: from } },
      include: { attendees: true },
      orderBy: { startAt: 'asc' },
    });
  });

  const OTHER_USER_ID = '33333333-3333-3333-3333-333333333333';

  it('list: katilimci secilmeden olusturulan etkinlik sadece olusturana gorunur', async () => {
    const privateEvent = createEventRow({
      createdById: USER_ID,
      attendees: [attendeeRow(USER_ID)],
    });
    const prisma = createPrisma();
    prisma.calendarEvent.findMany = vi.fn().mockResolvedValue([privateEvent]);
    const service = makeService(prisma);

    const asCreator = await service.list({ order: 'asc' } as never, USER_ID);
    expect(asCreator).toEqual([privateEvent]);

    const asOther = await service.list(
      { order: 'asc' } as never,
      OTHER_USER_ID,
    );
    expect(asOther).toEqual([]);
  });

  it('list: ACCEPTED katilimciya birden fazla katilimcili etkinlik gorunur', async () => {
    const sharedEvent = createEventRow({
      createdById: USER_ID,
      attendees: [
        attendeeRow(USER_ID),
        attendeeRow(OTHER_USER_ID, { status: 'ACCEPTED' }),
      ],
    });
    const prisma = createPrisma();
    prisma.calendarEvent.findMany = vi.fn().mockResolvedValue([sharedEvent]);
    const service = makeService(prisma);

    const asOther = await service.list(
      { order: 'asc' } as never,
      OTHER_USER_ID,
    );
    expect(asOther).toEqual([sharedEvent]);
  });

  it('list: PENDING davetli kendi izgarasinda etkinligi gormez', async () => {
    const sharedEvent = createEventRow({
      createdById: USER_ID,
      attendees: [
        attendeeRow(USER_ID),
        attendeeRow(OTHER_USER_ID, { status: 'PENDING' }),
      ],
    });
    const prisma = createPrisma();
    prisma.calendarEvent.findMany = vi.fn().mockResolvedValue([sharedEvent]);
    const service = makeService(prisma);

    const asOther = await service.list(
      { order: 'asc' } as never,
      OTHER_USER_ID,
    );
    expect(asOther).toEqual([]);
  });

  it('list: DECLINED katilimci kendi izgarasinda etkinligi gormez', async () => {
    const sharedEvent = createEventRow({
      createdById: USER_ID,
      attendees: [
        attendeeRow(USER_ID),
        attendeeRow(OTHER_USER_ID, { status: 'DECLINED' }),
      ],
    });
    const prisma = createPrisma();
    prisma.calendarEvent.findMany = vi.fn().mockResolvedValue([sharedEvent]);
    const service = makeService(prisma);

    const asOther = await service.list(
      { order: 'asc' } as never,
      OTHER_USER_ID,
    );
    expect(asOther).toEqual([]);
  });

  it('list: userId verilmemisse (kendim) mevcut birlestirilmis davranis degismez', async () => {
    const otherPersonEvent = createEventRow({
      id: 'other-event',
      createdById: OTHER_USER_ID,
      attendees: [attendeeRow(OTHER_USER_ID), attendeeRow('third-user')],
    });
    const prisma = createPrisma();
    prisma.calendarEvent.findMany = vi
      .fn()
      .mockResolvedValue([otherPersonEvent]);
    const service = makeService(prisma);
    const result = await service.list({ order: 'asc' } as never, USER_ID);
    expect(result).toEqual([otherPersonEvent]);
  });

  it('list: izin verilmemis bir userId istenirse FORBIDDEN firlatir', async () => {
    const prisma = createPrisma();
    const calendarShares = { canView: vi.fn().mockResolvedValue(false) };
    const service = makeService(prisma, { calendarShares });
    await expect(
      service.list({ order: 'asc', userId: OTHER_USER_ID } as never, USER_ID),
    ).rejects.toMatchObject({ code: 'CALENDAR_NOT_SHARED' });
    expect(calendarShares.canView).toHaveBeenCalledWith(OTHER_USER_ID, USER_ID);
  });

  it('list: izinli userId sadece o kullanicinin ACCEPTED katildigi etkinliklere daraltir', async () => {
    const ownEvent = createEventRow({
      id: 'own-event',
      createdById: OTHER_USER_ID,
      attendees: [attendeeRow(OTHER_USER_ID)],
    });
    const unrelatedEvent = createEventRow({
      id: 'unrelated-event',
      createdById: USER_ID,
      attendees: [attendeeRow(USER_ID)],
    });
    const prisma = createPrisma();
    prisma.calendarEvent.findMany = vi
      .fn()
      .mockResolvedValue([ownEvent, unrelatedEvent]);
    const calendarShares = { canView: vi.fn().mockResolvedValue(true) };
    const service = makeService(prisma, { calendarShares });
    const result = await service.list(
      { order: 'asc', userId: OTHER_USER_ID } as never,
      USER_ID,
    );
    expect(result).toEqual([ownEvent]);
  });

  it('getById: baskasinin ozel etkinligi icin NOT_FOUND firlatir', async () => {
    const privateEvent = createEventRow({
      createdById: USER_ID,
      attendees: [attendeeRow(USER_ID)],
    });
    const prisma = createPrisma(privateEvent);
    const service = makeService(prisma);

    await expect(
      service.getById(EVENT_ID, OTHER_USER_ID),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(service.getById(EVENT_ID, USER_ID)).resolves.toEqual(
      privateEvent,
    );
  });

  it('create: ozel hatirlatici olusunca websocket yayini yapilmaz', async () => {
    const prisma = createPrisma();
    const realtime = { emitToTenant: vi.fn() } as never;
    const service = makeService(prisma, { realtime });
    await service.create('tenant-1', USER_ID, {
      title: 'Musteri ziyareti',
      startAt: new Date('2026-09-10T10:00:00.000Z'),
      endAt: new Date('2026-09-10T11:00:00.000Z'),
    } as never);
    expect(
      (realtime as { emitToTenant: ReturnType<typeof vi.fn> }).emitToTenant,
    ).not.toHaveBeenCalled();
  });

  it('create: bugun icin kendine hatirlatici kurunca aninda bildirim gonderir', async () => {
    const today = new Date();
    const todayEvent = createEventRow({
      createdById: USER_ID,
      startAt: today,
      endAt: today,
      attendees: [attendeeRow(USER_ID)],
    });
    const prisma = createPrisma(todayEvent);
    const notifications = { create: vi.fn() } as never;
    const service = makeService(prisma, { notifications });
    await service.create('tenant-1', USER_ID, {
      title: 'Bugunku hatirlatici',
      startAt: today,
      endAt: today,
    } as never);
    expect(
      (notifications as { create: ReturnType<typeof vi.fn> }).create,
    ).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({
        recipientUserId: USER_ID,
        type: 'CALENDAR_REMINDERS_DUE_TODAY',
      }),
    );
  });

  it('create: ilerideki bir tarih icin kendine hatirlatici kurunca aninda bildirim gondermez', async () => {
    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const futureEvent = createEventRow({
      createdById: USER_ID,
      startAt: futureDate,
      endAt: futureDate,
      attendees: [attendeeRow(USER_ID)],
    });
    const prisma = createPrisma(futureEvent);
    const notifications = { create: vi.fn() } as never;
    const service = makeService(prisma, { notifications });
    await service.create('tenant-1', USER_ID, {
      title: 'Ileri tarihli hatirlatici',
      startAt: futureDate,
      endAt: futureDate,
    } as never);
    expect(
      (notifications as { create: ReturnType<typeof vi.fn> }).create,
    ).not.toHaveBeenCalled();
  });

  it('create: paylasilan etkinlik olusunca tenant a websocket yayini yapilir', async () => {
    const sharedEvent = createEventRow({
      createdById: USER_ID,
      attendees: [
        attendeeRow(USER_ID),
        attendeeRow(OTHER_USER_ID, { status: 'PENDING' }),
      ],
    });
    const prisma = createPrisma(sharedEvent);
    const realtime = { emitToTenant: vi.fn() } as never;
    const service = makeService(prisma, { realtime });
    await service.create('tenant-1', USER_ID, {
      title: 'Musteri ziyareti',
      startAt: new Date('2026-09-10T10:00:00.000Z'),
      endAt: new Date('2026-09-10T11:00:00.000Z'),
      attendees: [{ userId: USER_ID }, { userId: OTHER_USER_ID }],
    } as never);
    expect(
      (realtime as { emitToTenant: ReturnType<typeof vi.fn> }).emitToTenant,
    ).toHaveBeenCalledWith('tenant-1', 'calendar-events.event.changed', {});
  });

  it('update: paylasilan hale gelen etkinlik icin websocket yayini yapilir', async () => {
    const before = createEventRow({
      createdById: USER_ID,
      attendees: [attendeeRow(USER_ID)],
    });
    const prisma = createPrisma(before);
    prisma.calendarEvent.update = vi.fn().mockResolvedValue(
      createEventRow({
        createdById: USER_ID,
        attendees: [
          attendeeRow(USER_ID),
          attendeeRow(OTHER_USER_ID, { status: 'PENDING' }),
        ],
      }),
    );
    const realtime = { emitToTenant: vi.fn() } as never;
    const service = makeService(prisma, { realtime });
    await service.update(
      EVENT_ID,
      { attendees: [{ userId: USER_ID }, { userId: OTHER_USER_ID }] } as never,
      'tenant-1',
    );
    expect(
      (realtime as { emitToTenant: ReturnType<typeof vi.fn> }).emitToTenant,
    ).toHaveBeenCalledWith('tenant-1', 'calendar-events.event.changed', {});
  });

  it('remove: ozel hatirlatici silinince websocket yayini yapilmaz', async () => {
    const privateEvent = createEventRow({
      createdById: USER_ID,
      attendees: [attendeeRow(USER_ID)],
    });
    const prisma = createPrisma(privateEvent);
    const realtime = { emitToTenant: vi.fn() } as never;
    const service = makeService(prisma, { realtime });
    await service.remove(EVENT_ID, 'tenant-1', USER_ID);
    expect(
      (realtime as { emitToTenant: ReturnType<typeof vi.fn> }).emitToTenant,
    ).not.toHaveBeenCalled();
  });

  it('listPendingInvites: PENDING oldugum davetleri oluşturan adiyla doner', async () => {
    const event = createEventRow({
      createdById: OTHER_USER_ID,
      description: 'Ziyaret oncesi hazirlik notlari',
    });
    const prisma = createPrisma();
    prisma.calendarEventAttendee.findMany = vi
      .fn()
      .mockResolvedValue([{ id: 'attendee-1', event }]);
    prisma.user.findMany = vi
      .fn()
      .mockResolvedValue([{ id: OTHER_USER_ID, name: 'Mehmet Demir' }]);
    const service = makeService(prisma);
    const result = await service.listPendingInvites(USER_ID);
    expect(prisma.calendarEventAttendee.findMany).toHaveBeenCalledWith({
      where: { userId: USER_ID, status: 'PENDING', event: { deletedAt: null } },
      include: { event: true },
    });
    expect(result).toEqual([
      expect.objectContaining({
        attendeeId: 'attendee-1',
        eventId: EVENT_ID,
        eventDescription: 'Ziyaret oncesi hazirlik notlari',
        creatorId: OTHER_USER_ID,
        creatorName: 'Mehmet Demir',
      }),
    ]);
  });

  it('listSentInvites: olusturdugum etkinliklerin diger katilimci satirlarini doner', async () => {
    const event = createEventRow({ createdById: USER_ID });
    const prisma = createPrisma();
    prisma.calendarEventAttendee.findMany = vi.fn().mockResolvedValue([
      {
        id: 'attendee-1',
        userId: OTHER_USER_ID,
        status: 'DECLINED',
        responseNote: 'Musait degilim',
        respondedAt: new Date('2026-09-02T00:00:00.000Z'),
        event,
      },
    ]);
    prisma.user.findMany = vi
      .fn()
      .mockResolvedValue([{ id: OTHER_USER_ID, name: 'Mehmet Demir' }]);
    const service = makeService(prisma);
    const result = await service.listSentInvites(USER_ID);
    expect(prisma.calendarEventAttendee.findMany).toHaveBeenCalledWith({
      where: {
        userId: { not: USER_ID },
        event: { createdById: USER_ID, deletedAt: null },
      },
      include: { event: true },
      orderBy: { event: { startAt: 'desc' } },
    });
    expect(result).toEqual([
      expect.objectContaining({
        attendeeUserId: OTHER_USER_ID,
        attendeeName: 'Mehmet Demir',
        status: 'DECLINED',
        responseNote: 'Musait degilim',
      }),
    ]);
  });
});
