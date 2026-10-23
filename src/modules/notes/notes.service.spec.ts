import { AppException } from '../../core/errors/app.exception';
import { TenantContext } from '../../core/tenant/tenant-context';
import { NotesService } from './notes.service';

const fakeAudit = { log: vi.fn() };
const fakeCalendarEventsCache = { invalidate: vi.fn() };

const TENANT_ID = 'tenant-1';
const USER_ID = 'user-1';
const OTHER_USER_ID = 'user-2';
const NOTE_ID = 'note-1';

function runInTenant<T>(fn: () => Promise<T>): Promise<T> {
  return TenantContext.run(
    { tenantId: TENANT_ID, userId: USER_ID, roleIds: [] },
    fn,
  );
}

function createNoteRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: NOTE_ID,
    content: 'Musteriyi ara',
    color: 'YELLOW',
    isPrivate: true,
    createdById: USER_ID,
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    ...overrides,
  };
}

function createPrisma(overrides: Partial<Record<string, unknown>> = {}) {
  const client = {
    note: {
      findMany: vi.fn().mockResolvedValue([createNoteRow()]),
      findFirst: vi.fn().mockResolvedValue(createNoteRow()),
      create: vi.fn().mockResolvedValue(createNoteRow()),
      update: vi.fn().mockResolvedValue(createNoteRow()),
      delete: vi.fn().mockResolvedValue(createNoteRow()),
    },
    calendarEvent: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'event-1' }),
      update: vi.fn().mockResolvedValue({ id: 'event-1' }),
      delete: vi.fn().mockResolvedValue({ id: 'event-1' }),
    },
    ...overrides,
  };
  return {
    ...client,
    $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(client)),
  };
}

function makeService(prisma: unknown) {
  return new NotesService(
    prisma as never,
    fakeAudit as never,
    fakeCalendarEventsCache as never,
  );
}

beforeEach(() => {
  fakeAudit.log.mockClear();
  fakeCalendarEventsCache.invalidate.mockClear();
});

describe('NotesService', () => {
  it('list: bana-ozel VEYA paylasimli filtresiyle sorgular', async () => {
    const prisma = createPrisma();
    const service = makeService(prisma);

    await runInTenant(() => service.list(USER_ID));

    expect(prisma.note.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ isPrivate: false }, { createdById: USER_ID }] },
      }),
    );
  });

  it('create: notu varsayilan olarak bana-ozel kaydeder, hatirlatma yoksa CalendarEvent olusturmaz', async () => {
    const prisma = createPrisma();
    const service = makeService(prisma);

    await runInTenant(() =>
      service.create(TENANT_ID, USER_ID, {
        content: 'Not',
        color: 'BLUE',
        isPrivate: true,
      }),
    );

    expect(prisma.note.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          content: 'Not',
          color: 'BLUE',
          isPrivate: true,
          createdById: USER_ID,
        }),
      }),
    );
    expect(prisma.calendarEvent.create).not.toHaveBeenCalled();
    expect(fakeCalendarEventsCache.invalidate).not.toHaveBeenCalled();
    expect(fakeAudit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CREATE', entity: 'Note' }),
    );
  });

  it('create: hatirlatma verilirse aciklamasiyla birlikte kendisi ACCEPTED katilimci olarak CalendarEvent olusturur', async () => {
    const prisma = createPrisma();
    const service = makeService(prisma);

    await runInTenant(() =>
      service.create(TENANT_ID, USER_ID, {
        content: 'Not',
        color: 'YELLOW',
        isPrivate: false,
        reminder: {
          startAt: '2026-11-01T09:00:00.000Z',
          title: 'Hatirlatma',
          description: 'Detay',
        },
      }),
    );

    expect(prisma.calendarEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: TENANT_ID,
          createdById: USER_ID,
          title: 'Hatirlatma',
          description: 'Detay',
          relatedEntityType: 'Note',
          relatedEntityId: NOTE_ID,
          attendees: {
            create: [
              {
                userId: USER_ID,
                status: 'ACCEPTED',
                respondedAt: expect.any(Date),
              },
            ],
          },
        }),
      }),
    );
    expect(fakeCalendarEventsCache.invalidate).toHaveBeenCalledTimes(1);
  });

  it('update: var olmayan notta NOT_FOUND firlatir', async () => {
    const prisma = createPrisma({
      note: { findFirst: vi.fn().mockResolvedValue(null) },
    });
    const service = makeService(prisma);

    await expect(
      runInTenant(() => service.update(NOTE_ID, USER_ID, { content: 'x' })),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<AppException>);
  });

  it('update: bana-ozel bir notu sahibi olmayan biri gorememeli (NOT_FOUND)', async () => {
    const prisma = createPrisma();
    const service = makeService(prisma);

    await expect(
      runInTenant(() =>
        service.update(NOTE_ID, OTHER_USER_ID, { content: 'x' }),
      ),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<AppException>);
    expect(prisma.note.update).not.toHaveBeenCalled();
  });

  it('update: paylasimli bir notu sahibi olmayan biri de duzenleyebilir', async () => {
    const prisma = createPrisma();
    prisma.note.findFirst.mockResolvedValue(
      createNoteRow({ isPrivate: false }),
    );
    const service = makeService(prisma);

    await runInTenant(() =>
      service.update(NOTE_ID, OTHER_USER_ID, { content: 'guncel' }),
    );

    expect(prisma.note.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: NOTE_ID } }),
    );
  });

  it('update: reminder:null gonderilirse mevcut hatirlatmayi siler', async () => {
    const prisma = createPrisma();
    prisma.calendarEvent.findFirst.mockResolvedValue({ id: 'event-1' });
    const service = makeService(prisma);

    await runInTenant(() =>
      service.update(NOTE_ID, USER_ID, { reminder: null }),
    );

    expect(prisma.calendarEvent.delete).toHaveBeenCalledWith({
      where: { id: 'event-1' },
    });
    expect(fakeCalendarEventsCache.invalidate).toHaveBeenCalledTimes(1);
  });

  it('update: reminder alani gonderilmezse mevcut hatirlatmaya dokunmaz', async () => {
    const prisma = createPrisma();
    const service = makeService(prisma);

    await runInTenant(() =>
      service.update(NOTE_ID, USER_ID, { content: 'guncel metin' }),
    );

    expect(prisma.calendarEvent.findFirst).not.toHaveBeenCalled();
    expect(fakeCalendarEventsCache.invalidate).not.toHaveBeenCalled();
  });

  it('remove: var olmayan notta NOT_FOUND firlatir', async () => {
    const prisma = createPrisma({
      note: { findFirst: vi.fn().mockResolvedValue(null) },
    });
    const service = makeService(prisma);

    await expect(
      runInTenant(() => service.remove(NOTE_ID, USER_ID)),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<AppException>);
  });

  it('remove: bana-ozel bir notu sahibi olmayan biri silemez (NOT_FOUND)', async () => {
    const prisma = createPrisma();
    const service = makeService(prisma);

    await expect(
      runInTenant(() => service.remove(NOTE_ID, OTHER_USER_ID)),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<AppException>);
    expect(prisma.note.delete).not.toHaveBeenCalled();
  });

  it('remove: iliskili hatirlatma varsa onu da siler', async () => {
    const prisma = createPrisma();
    prisma.calendarEvent.findFirst.mockResolvedValue({ id: 'event-1' });
    const service = makeService(prisma);

    await runInTenant(() => service.remove(NOTE_ID, USER_ID));

    expect(prisma.note.delete).toHaveBeenCalledWith({ where: { id: NOTE_ID } });
    expect(prisma.calendarEvent.delete).toHaveBeenCalledWith({
      where: { id: 'event-1' },
    });
  });

  it('list: notlari ilgili CalendarEvent (aciklamasiyla birlikte) ile eslestirir', async () => {
    const prisma = createPrisma();
    prisma.calendarEvent.findMany.mockResolvedValue([
      {
        id: 'event-1',
        title: 'Hatirlatma',
        description: 'Detay',
        startAt: new Date('2026-11-01T09:00:00.000Z'),
        relatedEntityId: NOTE_ID,
      },
    ]);
    const service = makeService(prisma);

    const result = await runInTenant(() => service.list(USER_ID));

    expect(result).toEqual([
      expect.objectContaining({
        id: NOTE_ID,
        reminder: {
          id: 'event-1',
          title: 'Hatirlatma',
          description: 'Detay',
          startAt: new Date('2026-11-01T09:00:00.000Z'),
        },
      }),
    ]);
  });
});
