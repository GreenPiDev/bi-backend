import { AppException } from '../../core/errors/app.exception';
import { CalendarEventsService } from './calendar-events.service';

const fakeAudit = { log: vi.fn() } as never;

const EVENT_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = '22222222-2222-2222-2222-222222222222';

function createEventRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: EVENT_ID,
    title: 'Musteri ziyareti',
    startAt: new Date('2026-09-10T10:00:00.000Z'),
    endAt: new Date('2026-09-10T11:00:00.000Z'),
    allDay: false,
    attendees: [],
    ...overrides,
  };
}

function createPrisma(eventRow: unknown = createEventRow()) {
  const client = {
    user: {
      findMany: vi
        .fn()
        .mockResolvedValue([{ id: USER_ID, name: 'Ayse Yilmaz' }]),
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
    const service = new CalendarEventsService(prisma as never, fakeAudit);
    await expect(service.getById('yok')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<AppException>);
  });

  it('create: attendee verilmezse olusturan kullaniciyi tek katilimci olarak ekler', async () => {
    const prisma = createPrisma();
    const service = new CalendarEventsService(prisma as never, fakeAudit);
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
    const service = new CalendarEventsService(prisma as never, fakeAudit);
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
    const service = new CalendarEventsService(prisma as never, fakeAudit);
    await expect(
      service.update('yok', { title: 'x' } as never),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('update: attendees verilirse once eskileri siler sonra yenilerini ekler', async () => {
    const prisma = createPrisma();
    const service = new CalendarEventsService(prisma as never, fakeAudit);
    await service.update(EVENT_ID, {
      attendees: [{ userId: USER_ID }],
    } as never);
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
    const service = new CalendarEventsService(prisma as never, fakeAudit);
    await service.update(EVENT_ID, { title: 'Yeni baslik' } as never);
    expect(prisma.calendarEventAttendee.deleteMany).not.toHaveBeenCalled();
    expect(prisma.calendarEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ attendees: expect.anything() }),
      }),
    );
  });

  it('remove: etkinligi siler ve audit log yazar', async () => {
    const prisma = createPrisma();
    const service = new CalendarEventsService(prisma as never, fakeAudit);
    await service.remove(EVENT_ID);
    expect(prisma.calendarEvent.delete).toHaveBeenCalledWith({
      where: { id: EVENT_ID },
    });
  });

  it('listAssignableUsers: aktif kullanicilari isim/id ile doner', async () => {
    const prisma = createPrisma();
    const service = new CalendarEventsService(prisma as never, fakeAudit);
    const result = await service.listAssignableUsers();
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { isActive: true, isPlatformAdmin: false },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    expect(result).toEqual([{ id: USER_ID, name: 'Ayse Yilmaz' }]);
  });

  it('list: from/to araligini ortusme sorgusuna cevirir', async () => {
    const prisma = createPrisma();
    const from = new Date('2026-09-01T00:00:00.000Z');
    const to = new Date('2026-09-30T23:59:59.000Z');
    const service = new CalendarEventsService(prisma as never, fakeAudit);
    await service.list({ from, to, order: 'asc' });
    expect(prisma.calendarEvent.findMany).toHaveBeenCalledWith({
      where: { startAt: { lte: to }, endAt: { gte: from } },
      include: { attendees: true },
      orderBy: { startAt: 'asc' },
    });
  });
});
