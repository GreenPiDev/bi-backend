import { AppException } from '../../core/errors/app.exception';
import { CalendarEventsService } from './calendar-events.service';

const fakeAudit = { log: vi.fn() } as never;
const fakeFileUrl = { build: vi.fn(() => null) } as never;
const fakeCalendarEventsCache = {
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn(),
  invalidate: vi.fn(),
} as never;
const fakeRealtime = { emitToTenant: vi.fn() } as never;

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

function createPrisma(eventRow: unknown = createEventRow()) {
  const client = {
    user: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: USER_ID,
          name: 'Ayse Yilmaz',
          avatarKey: null,
          updatedAt: new Date('2026-09-01T00:00:00.000Z'),
        },
      ]),
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
    },
    $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(client)),
  };
  return client;
}

describe('CalendarEventsService', () => {
  it('getById: bulunamayan etkinlik icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma(null);
    const service = new CalendarEventsService(
      prisma as never,
      fakeAudit,
      fakeFileUrl,
      fakeCalendarEventsCache,
      fakeRealtime,
    );
    await expect(service.getById('yok', USER_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<AppException>);
  });

  it('create: attendee verilmezse olusturan kullaniciyi tek katilimci olarak ekler', async () => {
    const prisma = createPrisma();
    const service = new CalendarEventsService(
      prisma as never,
      fakeAudit,
      fakeFileUrl,
      fakeCalendarEventsCache,
      fakeRealtime,
    );
    await service.create('tenant-1', USER_ID, {
      title: 'Musteri ziyareti',
      startAt: new Date('2026-09-10T10:00:00.000Z'),
      endAt: new Date('2026-09-10T11:00:00.000Z'),
    } as never);
    expect(prisma.calendarEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          attendees: { create: [{ userId: USER_ID }] },
        }),
      }),
    );
  });

  it('create: verilen attendee listesini kullanir', async () => {
    const prisma = createPrisma();
    const service = new CalendarEventsService(
      prisma as never,
      fakeAudit,
      fakeFileUrl,
      fakeCalendarEventsCache,
      fakeRealtime,
    );
    await service.create('tenant-1', USER_ID, {
      title: 'Musteri ziyareti',
      startAt: new Date('2026-09-10T10:00:00.000Z'),
      endAt: new Date('2026-09-10T11:00:00.000Z'),
      attendees: [{ userId: USER_ID, note: 'sunumu hazirla' }],
    } as never);
    expect(prisma.calendarEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          attendees: { create: [{ userId: USER_ID, note: 'sunumu hazirla' }] },
        }),
      }),
    );
  });

  it('update: bulunamayan etkinlik icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma(null);
    const service = new CalendarEventsService(
      prisma as never,
      fakeAudit,
      fakeFileUrl,
      fakeCalendarEventsCache,
      fakeRealtime,
    );
    await expect(
      service.update('yok', { title: 'x' } as never, 'tenant-1'),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('update: attendees verilirse once eskileri siler sonra yenilerini ekler', async () => {
    const prisma = createPrisma();
    const service = new CalendarEventsService(
      prisma as never,
      fakeAudit,
      fakeFileUrl,
      fakeCalendarEventsCache,
      fakeRealtime,
    );
    await service.update(
      EVENT_ID,
      { attendees: [{ userId: USER_ID }] } as never,
      'tenant-1',
    );
    expect(prisma.calendarEventAttendee.deleteMany).toHaveBeenCalledWith({
      where: { eventId: EVENT_ID },
    });
    expect(prisma.calendarEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          attendees: { create: [{ userId: USER_ID }] },
        }),
      }),
    );
  });

  it('update: attendees verilmezse mevcut katilimcilara dokunmaz', async () => {
    const prisma = createPrisma();
    const service = new CalendarEventsService(
      prisma as never,
      fakeAudit,
      fakeFileUrl,
      fakeCalendarEventsCache,
      fakeRealtime,
    );
    await service.update(
      EVENT_ID,
      { title: 'Yeni baslik' } as never,
      'tenant-1',
    );
    expect(prisma.calendarEventAttendee.deleteMany).not.toHaveBeenCalled();
    expect(prisma.calendarEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ attendees: expect.anything() }),
      }),
    );
  });

  it('remove: etkinligi siler ve audit log yazar', async () => {
    const prisma = createPrisma();
    const service = new CalendarEventsService(
      prisma as never,
      fakeAudit,
      fakeFileUrl,
      fakeCalendarEventsCache,
      fakeRealtime,
    );
    await service.remove(EVENT_ID, 'tenant-1');
    expect(prisma.calendarEvent.delete).toHaveBeenCalledWith({
      where: { id: EVENT_ID },
    });
  });

  it('listAssignableUsers: aktif kullanicilari isim/id/avatarUrl ile doner', async () => {
    const prisma = createPrisma();
    const service = new CalendarEventsService(
      prisma as never,
      fakeAudit,
      fakeFileUrl,
      fakeCalendarEventsCache,
      fakeRealtime,
    );
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
    const service = new CalendarEventsService(
      prisma as never,
      fakeAudit,
      fakeFileUrl,
      fakeCalendarEventsCache,
      fakeRealtime,
    );
    await service.list({ from, to, order: 'asc' }, USER_ID);
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
      attendees: [{ userId: USER_ID }],
    });
    const prisma = createPrisma();
    prisma.calendarEvent.findMany = vi.fn().mockResolvedValue([privateEvent]);
    const service = new CalendarEventsService(
      prisma as never,
      fakeAudit,
      fakeFileUrl,
      fakeCalendarEventsCache,
      fakeRealtime,
    );

    const asCreator = await service.list({ order: 'asc' } as never, USER_ID);
    expect(asCreator).toEqual([privateEvent]);

    const asOther = await service.list(
      { order: 'asc' } as never,
      OTHER_USER_ID,
    );
    expect(asOther).toEqual([]);
  });

  it('list: birden fazla katilimcili etkinlik herkese gorunur', async () => {
    const sharedEvent = createEventRow({
      createdById: USER_ID,
      attendees: [{ userId: USER_ID }, { userId: OTHER_USER_ID }],
    });
    const prisma = createPrisma();
    prisma.calendarEvent.findMany = vi.fn().mockResolvedValue([sharedEvent]);
    const service = new CalendarEventsService(
      prisma as never,
      fakeAudit,
      fakeFileUrl,
      fakeCalendarEventsCache,
      fakeRealtime,
    );

    const asOther = await service.list(
      { order: 'asc' } as never,
      OTHER_USER_ID,
    );
    expect(asOther).toEqual([sharedEvent]);
  });

  it('getById: baskasinin ozel etkinligi icin NOT_FOUND firlatir', async () => {
    const privateEvent = createEventRow({
      createdById: USER_ID,
      attendees: [{ userId: USER_ID }],
    });
    const prisma = createPrisma(privateEvent);
    const service = new CalendarEventsService(
      prisma as never,
      fakeAudit,
      fakeFileUrl,
      fakeCalendarEventsCache,
      fakeRealtime,
    );

    await expect(
      service.getById(EVENT_ID, OTHER_USER_ID),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(service.getById(EVENT_ID, USER_ID)).resolves.toEqual(
      privateEvent,
    );
  });

  it('create: ozel hatirlatici olusunca websocket yayini yapilmaz', async () => {
    const prisma = createPrisma();
    const realtime = { emitToTenant: vi.fn() } as never;
    const service = new CalendarEventsService(
      prisma as never,
      fakeAudit,
      fakeFileUrl,
      fakeCalendarEventsCache,
      realtime,
    );
    await service.create('tenant-1', USER_ID, {
      title: 'Musteri ziyareti',
      startAt: new Date('2026-09-10T10:00:00.000Z'),
      endAt: new Date('2026-09-10T11:00:00.000Z'),
    } as never);
    expect(
      (realtime as { emitToTenant: ReturnType<typeof vi.fn> }).emitToTenant,
    ).not.toHaveBeenCalled();
  });

  it('create: paylasilan etkinlik olusunca tenant a websocket yayini yapilir', async () => {
    const sharedEvent = createEventRow({
      createdById: USER_ID,
      attendees: [{ userId: USER_ID }, { userId: OTHER_USER_ID }],
    });
    const prisma = createPrisma(sharedEvent);
    const realtime = { emitToTenant: vi.fn() } as never;
    const service = new CalendarEventsService(
      prisma as never,
      fakeAudit,
      fakeFileUrl,
      fakeCalendarEventsCache,
      realtime,
    );
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
      attendees: [{ userId: USER_ID }],
    });
    const prisma = createPrisma(before);
    prisma.calendarEvent.update = vi.fn().mockResolvedValue(
      createEventRow({
        createdById: USER_ID,
        attendees: [{ userId: USER_ID }, { userId: OTHER_USER_ID }],
      }),
    );
    const realtime = { emitToTenant: vi.fn() } as never;
    const service = new CalendarEventsService(
      prisma as never,
      fakeAudit,
      fakeFileUrl,
      fakeCalendarEventsCache,
      realtime,
    );
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
      attendees: [{ userId: USER_ID }],
    });
    const prisma = createPrisma(privateEvent);
    const realtime = { emitToTenant: vi.fn() } as never;
    const service = new CalendarEventsService(
      prisma as never,
      fakeAudit,
      fakeFileUrl,
      fakeCalendarEventsCache,
      realtime,
    );
    await service.remove(EVENT_ID, 'tenant-1');
    expect(
      (realtime as { emitToTenant: ReturnType<typeof vi.fn> }).emitToTenant,
    ).not.toHaveBeenCalled();
  });
});
