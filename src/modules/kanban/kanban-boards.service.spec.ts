import { UpdateKanbanBoardSchema } from './dto/kanban.dto';
import { KanbanBoardsService } from './kanban-boards.service';

const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PARTNER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OUTSIDER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

interface BoardRow {
  id: string;
  tenantId: string;
  partnerTenantId: string | null;
  name: string;
  deletedAt: Date | null;
  createdAt: Date;
}

type BoardWhere = {
  id?: string;
  deletedAt?: null;
  OR?: { tenantId?: string; partnerTenantId?: string }[];
};

function matches(row: BoardRow, where: BoardWhere): boolean {
  if (where.id !== undefined && row.id !== where.id) return false;
  if (where.deletedAt === null && row.deletedAt !== null) return false;
  if (where.OR) {
    return where.OR.some(
      (cond) =>
        (cond.tenantId !== undefined && row.tenantId === cond.tenantId) ||
        (cond.partnerTenantId !== undefined &&
          row.partnerTenantId === cond.partnerTenantId),
    );
  }
  return true;
}

function setup(initial: BoardRow[] = []) {
  const boards = [...initial];
  const tenantName = (id: string | null) =>
    id ? { id, name: `T-${id.slice(0, 1)}` } : null;
  const prisma = {
    tenant: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        [OWNER, PARTNER, OUTSIDER].includes(where.id) ? { id: where.id } : null,
      ),
    },
    kanbanBoard: {
      findFirst: vi.fn(
        async ({ where }: { where: BoardWhere }) =>
          boards.find((row) => matches(row, where)) ?? null,
      ),
      findMany: vi.fn(async ({ where }: { where: BoardWhere }) =>
        boards
          .filter((row) => matches(row, where))
          .map((row) => ({
            ...row,
            tenant: tenantName(row.tenantId),
            partnerTenant: tenantName(row.partnerTenantId),
          })),
      ),
      create: vi.fn(
        async ({
          data,
        }: {
          data: Omit<BoardRow, 'id' | 'deletedAt' | 'createdAt'>;
        }) => {
          const row: BoardRow = {
            ...data,
            id: `board-${boards.length + 1}`,
            deletedAt: null,
            createdAt: new Date(),
          };
          boards.push(row);
          return {
            ...row,
            tenant: tenantName(row.tenantId),
            partnerTenant: tenantName(row.partnerTenantId),
          };
        },
      ),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<BoardRow>;
        }) => {
          const row = boards.find((board) => board.id === where.id) as BoardRow;
          Object.assign(row, data);
          return row;
        },
      ),
    },
    kanbanCard: {
      groupBy: vi.fn(async () => [
        { boardId: 'b1', column: 'TODO', _count: { _all: 2 } },
        { boardId: 'b1', column: 'DONE', _count: { _all: 1 } },
      ]),
    },
  };
  const realtime = { emitToTenant: vi.fn() };
  const audit = { log: vi.fn() };
  const service = new KanbanBoardsService(
    prisma as never,
    realtime as never,
    audit as never,
  );
  return { service, prisma, realtime, boards };
}

const shared: BoardRow = {
  id: 'b1',
  tenantId: OWNER,
  partnerTenantId: PARTNER,
  name: 'Ortak',
  deletedAt: null,
  createdAt: new Date(),
};

describe('KanbanBoardsService', () => {
  it('lists a shared board for both owner and partner, never for an outsider', async () => {
    const { service } = setup([shared]);
    const owner = await service.list(OWNER);
    const partner = await service.list(PARTNER);
    const outsider = await service.list(OUTSIDER);

    expect(owner).toHaveLength(1);
    expect(owner[0].isOwner).toBe(true);
    expect(owner[0].cardCounts).toEqual({
      TODO: 2,
      IN_PROGRESS: 0,
      IN_REVIEW: 0,
      DONE: 1,
    });
    expect(partner).toHaveLength(1);
    expect(partner[0].isOwner).toBe(false);
    expect(outsider).toHaveLength(0);
  });

  it('returns 404 for an outsider tenant (does not leak existence)', async () => {
    const { service } = setup([shared]);
    await expect(service.findAccessible('b1', OUTSIDER)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('hides soft-deleted boards', async () => {
    const { service } = setup([{ ...shared, deletedAt: new Date() }]);
    await expect(service.findAccessible('b1', OWNER)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('rejects the own tenant as partner', async () => {
    const { service } = setup();
    await expect(
      service.create(OWNER, 'u1', { name: 'X', partnerTenantId: OWNER }),
    ).rejects.toMatchObject({ code: 'KANBAN_PARTNER_SELF' });
  });

  it('rejects an unknown partner tenant', async () => {
    const { service } = setup();
    await expect(
      service.create(OWNER, 'u1', {
        name: 'X',
        partnerTenantId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      }),
    ).rejects.toMatchObject({ code: 'KANBAN_PARTNER_NOT_FOUND' });
  });

  it('creates a shared board and notifies both tenants in realtime', async () => {
    const { service, realtime } = setup();
    const board = await service.create(OWNER, 'u1', {
      name: 'Ortak Proje',
      partnerTenantId: PARTNER,
    });
    expect(board.partnerTenant?.id).toBe(PARTNER);
    const tenants = realtime.emitToTenant.mock.calls.map((call) => call[0]);
    expect(tenants).toEqual([OWNER, PARTNER]);
  });

  it('lets the partner tenant rename a shared board, but not an outsider', async () => {
    const { service, boards } = setup([shared]);
    await service.update('b1', PARTNER, { name: 'Yeni Ad' });
    expect(boards[0].name).toBe('Yeni Ad');
    await expect(
      service.update('b1', OUTSIDER, { name: 'X' }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('never accepts a partner change on update (name only)', () => {
    expect(UpdateKanbanBoardSchema.safeParse({ name: 'Yeni' }).success).toBe(
      true,
    );
    expect(
      UpdateKanbanBoardSchema.safeParse({
        name: 'Yeni',
        partnerTenantId: OUTSIDER,
      }).success,
    ).toBe(false);
    expect(
      UpdateKanbanBoardSchema.safeParse({ partnerTenantId: null }).success,
    ).toBe(false);
  });

  it('only the owner tenant can delete; partner gets 403', async () => {
    const { service, boards } = setup([shared]);
    await expect(service.remove('b1', PARTNER)).rejects.toMatchObject({
      code: 'KANBAN_BOARD_OWNER_ONLY',
    });
    await service.remove('b1', OWNER);
    expect(boards[0].deletedAt).toBeInstanceOf(Date);
  });
});
