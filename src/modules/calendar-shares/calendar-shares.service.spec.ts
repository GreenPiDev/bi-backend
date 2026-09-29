import { CalendarSharesService } from './calendar-shares.service';

const fakeFileUrl = { build: vi.fn(() => null) } as never;
const fakeRealtime = { emitToTenant: vi.fn() } as never;

const TENANT_ID = 'tenant-1';
const OWNER_ID = '11111111-1111-1111-1111-111111111111';
const VIEWER_ID = '22222222-2222-2222-2222-222222222222';

function createPrisma() {
  const shares: { ownerId: string; viewerId: string }[] = [];
  const client = {
    user: {
      findMany: vi
        .fn()
        .mockImplementation(
          async (args: { where?: { id?: { in?: string[] } } } = {}) => {
            const ids = args.where?.id?.in ?? [];
            return ids.map((id) => ({
              id,
              name: 'Test Kullanici',
              avatarKey: null,
              updatedAt: new Date('2026-09-01T00:00:00.000Z'),
            }));
          },
        ),
    },
    calendarShare: {
      findMany: vi
        .fn()
        .mockImplementation(
          async (args: { where?: { ownerId?: string; viewerId?: string } }) => {
            return shares.filter((row) =>
              Object.entries(args.where ?? {}).every(
                ([key, value]) => (row as never)[key] === value,
              ),
            );
          },
        ),
      findFirst: vi
        .fn()
        .mockImplementation(
          async (args: { where?: { ownerId?: string; viewerId?: string } }) => {
            const match = shares.find((row) =>
              Object.entries(args.where ?? {}).every(
                ([key, value]) => (row as never)[key] === value,
              ),
            );
            return match ?? null;
          },
        ),
      deleteMany: vi
        .fn()
        .mockImplementation(async (args: { where: { ownerId: string } }) => {
          const before = shares.length;
          const remaining = shares.filter(
            (row) => row.ownerId !== args.where.ownerId,
          );
          shares.length = 0;
          shares.push(...remaining);
          return { count: before - shares.length };
        }),
      createMany: vi
        .fn()
        .mockImplementation(
          async (args: { data: { ownerId: string; viewerId: string }[] }) => {
            shares.push(...args.data);
            return { count: args.data.length };
          },
        ),
    },
    $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(client)),
  };
  return { client, shares };
}

describe('CalendarSharesService', () => {
  it('setGrants: kendine izin verme secenegini sessizce eler', async () => {
    const { client, shares } = createPrisma();
    const service = new CalendarSharesService(
      client as never,
      fakeFileUrl,
      fakeRealtime,
    );
    await service.setGrants(TENANT_ID, OWNER_ID, [VIEWER_ID, OWNER_ID]);
    expect(shares).toEqual([{ ownerId: OWNER_ID, viewerId: VIEWER_ID }]);
  });

  it('setGrants: mevcut seti tamamen yenisiyle degistirir', async () => {
    const { client, shares } = createPrisma();
    const service = new CalendarSharesService(
      client as never,
      fakeFileUrl,
      fakeRealtime,
    );
    await service.setGrants(TENANT_ID, OWNER_ID, [VIEWER_ID]);
    await service.setGrants(TENANT_ID, OWNER_ID, []);
    expect(shares).toEqual([]);
  });

  it('canView: sahibin kendisi icin her zaman true doner', async () => {
    const { client } = createPrisma();
    const service = new CalendarSharesService(
      client as never,
      fakeFileUrl,
      fakeRealtime,
    );
    await expect(service.canView(OWNER_ID, OWNER_ID)).resolves.toBe(true);
  });

  it('canView: izin verilmemis viewer icin false doner', async () => {
    const { client } = createPrisma();
    const service = new CalendarSharesService(
      client as never,
      fakeFileUrl,
      fakeRealtime,
    );
    await expect(service.canView(OWNER_ID, VIEWER_ID)).resolves.toBe(false);
  });

  it('canView: izin verilmis viewer icin true doner', async () => {
    const { client } = createPrisma();
    const service = new CalendarSharesService(
      client as never,
      fakeFileUrl,
      fakeRealtime,
    );
    await service.setGrants(TENANT_ID, OWNER_ID, [VIEWER_ID]);
    await expect(service.canView(OWNER_ID, VIEWER_ID)).resolves.toBe(true);
  });

  it('getSharedWithMe: viewer olarak izin verilen sahiplerin listesini doner', async () => {
    const { client } = createPrisma();
    const service = new CalendarSharesService(
      client as never,
      fakeFileUrl,
      fakeRealtime,
    );
    await service.setGrants(TENANT_ID, OWNER_ID, [VIEWER_ID]);
    const result = await service.getSharedWithMe(VIEWER_ID);
    expect(result).toEqual([
      { id: OWNER_ID, name: 'Test Kullanici', avatarUrl: null },
    ]);
  });
});
