import { AppException } from '../../core/errors/app.exception';
import { KanbanAssigneesService } from './kanban-assignees.service';
import { KanbanCardsService } from './kanban-cards.service';

const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PARTNER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ACTOR = '11111111-1111-4111-8111-111111111111';
const COLLEAGUE = '22222222-2222-4222-8222-222222222222';

interface CardRow {
  id: string;
  boardId: string;
  title: string;
  column: string;
  position: number;
  assigneeUserId: string | null;
  completedAt?: Date | null;
  completedById?: string | null;
}

const board = {
  id: 'b1',
  tenantId: OWNER,
  partnerTenantId: PARTNER,
  name: 'Ortak',
};

function setup(initial: CardRow[] = [], ownUsers = [ACTOR, COLLEAGUE]) {
  const cards = initial.map((card) => ({ ...card }));
  const withAssignee = (card: CardRow) => ({
    description: null,
    priority: 'MEDIUM',
    dueDate: null,
    completedAt: null,
    createdAt: new Date(),
    ...card,
    assignee: card.assigneeUserId
      ? {
          id: card.assigneeUserId,
          name: 'Kisi',
          tenantId: ownUsers.includes(card.assigneeUserId) ? OWNER : PARTNER,
          avatarKey: null,
          updatedAt: new Date(),
        }
      : null,
  });
  const revisions: { cardId: string; note: string; createdById: string }[] = [];
  const progressNotes: { cardId: string; note: string; createdById: string }[] =
    [];
  const tx = {
    kanbanCardProgressNote: {
      create: vi.fn(
        async ({
          data,
        }: {
          data: { cardId: string; note: string; createdById: string };
        }) => {
          progressNotes.push(data);
        },
      ),
    },
    kanbanCardRevision: {
      create: vi.fn(
        async ({
          data,
        }: {
          data: { cardId: string; note: string; createdById: string };
        }) => {
          revisions.push(data);
        },
      ),
    },
    kanbanCard: {
      findMany: vi.fn(
        async ({ where }: { where: { column: string; id: { not: string } } }) =>
          cards
            .filter(
              (card) =>
                card.column === where.column && card.id !== where.id.not,
            )
            .sort((a, b) => a.position - b.position),
      ),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<CardRow>;
        }) => {
          Object.assign(
            cards.find((card) => card.id === where.id) as CardRow,
            data,
          );
        },
      ),
    },
  };
  const prisma = {
    kanbanCard: {
      findFirst: vi.fn(
        async ({ where }: { where: { id: string } }) =>
          cards.find((card) => card.id === where.id) ?? null,
      ),
      updateMany: vi.fn(async ({ where }: { where: { column: string } }) => {
        for (const card of cards) {
          if (card.column === where.column) card.position += 1;
        }
      }),
      create: vi.fn(async ({ data }: { data: CardRow }) => {
        const row = { ...data, id: `c${cards.length + 1}` };
        cards.push(row);
        return withAssignee(row);
      }),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<CardRow>;
        }) => {
          const row = cards.find((card) => card.id === where.id) as CardRow;
          Object.assign(row, data);
          return withAssignee(row);
        },
      ),
      delete: vi.fn(),
    },
    $transaction: vi.fn(async (arg: unknown) =>
      Array.isArray(arg)
        ? Promise.all(arg)
        : (arg as (client: typeof tx) => Promise<void>)(tx),
    ),
  };
  const tenantPrisma = {
    user: {
      findFirst: vi.fn(async ({ where }: { where: { id: string } }) =>
        ownUsers.includes(where.id) ? { id: where.id } : null,
      ),
    },
  };
  const boards = {
    findAccessible: vi.fn(async () => board),
    emitChanged: vi.fn(),
  };
  const notifications = { create: vi.fn() };
  const service = new KanbanCardsService(
    prisma as never,
    new KanbanAssigneesService(
      tenantPrisma as never,
      { build: vi.fn(() => null) } as never,
    ),
    boards as never,
    { build: vi.fn(() => null) } as never,
    { log: vi.fn() } as never,
    notifications as never,
  );
  return {
    service,
    cards,
    notifications,
    boards,
    prisma,
    revisions,
    progressNotes,
  };
}

const createDto = {
  title: 'Is',
  assigneeUserId: COLLEAGUE,
  priority: 'MEDIUM' as const,
};

describe('KanbanCardsService', () => {
  it('rejects an assignee outside the acting tenant', async () => {
    const { service } = setup();
    await expect(
      service.createCard('b1', OWNER, ACTOR, {
        ...createDto,
        assigneeUserId: '99999999-9999-4999-8999-999999999999',
      }),
    ).rejects.toMatchObject({ code: 'USER_NOT_FOUND' });
  });

  it('inserts a new card at the top of TODO and notifies the assignee', async () => {
    const { service, cards, notifications, boards } = setup([
      {
        id: 'c1',
        boardId: 'b1',
        title: 'A',
        column: 'TODO',
        position: 0,
        assigneeUserId: ACTOR,
      },
    ]);
    const card = await service.createCard('b1', OWNER, ACTOR, createDto);
    expect(card.column).toBe('TODO');
    expect(cards[0].position).toBe(1);
    expect(cards[1].position).toBe(0);
    expect(notifications.create).toHaveBeenCalledWith(
      OWNER,
      expect.objectContaining({
        recipientUserId: COLLEAGUE,
        type: 'KANBAN_CARD_ASSIGNED',
      }),
    );
    expect(boards.emitChanged).toHaveBeenCalled();
  });

  it('creates an unassigned card when no assignee is given', async () => {
    const { service, notifications } = setup();
    const card = await service.createCard('b1', OWNER, ACTOR, {
      title: 'Atanmamis',
      priority: 'MEDIUM',
    });
    expect(card.assignee).toBeNull();
    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('removes the assignee when updated with null', async () => {
    const { service, cards } = setup([
      {
        id: 'c1',
        boardId: 'b1',
        title: 'A',
        column: 'TODO',
        position: 0,
        assigneeUserId: ACTOR,
      },
    ]);
    const card = await service.updateCard('b1', 'c1', OWNER, ACTOR, {
      assigneeUserId: null,
    });
    expect(card.assignee).toBeNull();
    expect(cards[0].assigneeUserId).toBeNull();
  });

  it('does not notify when the actor assigns the card to themselves', async () => {
    const { service, notifications } = setup();
    await service.createCard('b1', OWNER, ACTOR, {
      ...createDto,
      assigneeUserId: ACTOR,
    });
    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('hides the avatar of a partner-tenant assignee and marks it external', async () => {
    // ownUsers=[ACTOR]: COLLEAGUE bu kurulumda ortak (PARTNER) tenant'in kullanicisi
    const { service } = setup(
      [
        {
          id: 'c1',
          boardId: 'b1',
          title: 'A',
          column: 'TODO',
          position: 0,
          assigneeUserId: COLLEAGUE,
        },
      ],
      [ACTOR],
    );
    const card = await service.updateCard('b1', 'c1', OWNER, ACTOR, {
      title: 'B',
    });
    expect(card.assignee).toMatchObject({ isExternal: true, avatarUrl: null });
  });

  it('moves a card into the requested index and reorders the target column', async () => {
    const { service, cards } = setup([
      {
        id: 'c1',
        boardId: 'b1',
        title: 'A',
        column: 'IN_PROGRESS',
        position: 0,
        assigneeUserId: ACTOR,
      },
      {
        id: 'c2',
        boardId: 'b1',
        title: 'B',
        column: 'IN_PROGRESS',
        position: 1,
        assigneeUserId: ACTOR,
      },
      {
        id: 'c3',
        boardId: 'b1',
        title: 'C',
        column: 'TODO',
        position: 0,
        assigneeUserId: ACTOR,
      },
    ]);
    await service.moveCard('b1', 'c3', OWNER, ACTOR, {
      column: 'IN_PROGRESS',
      index: 1,
    });
    const byId = Object.fromEntries(cards.map((card) => [card.id, card]));
    expect(byId.c3).toMatchObject({ column: 'IN_PROGRESS', position: 1 });
    expect(byId.c1.position).toBe(0);
    expect(byId.c2.position).toBe(2);
  });

  it('appends a new revision entry on every pull-back from IN_REVIEW (keeps history)', async () => {
    const { service, cards, revisions } = setup([
      {
        id: 'c1',
        boardId: 'b1',
        title: 'A',
        column: 'IN_REVIEW',
        position: 0,
        assigneeUserId: ACTOR,
      },
    ]);
    await service.moveCard('b1', 'c1', OWNER, ACTOR, {
      column: 'IN_PROGRESS',
      index: 0,
      revisionNote: 'Birinci revize',
    });
    cards[0].column = 'IN_REVIEW';
    await service.moveCard('b1', 'c1', OWNER, ACTOR, {
      column: 'IN_PROGRESS',
      index: 0,
      revisionNote: 'Ikinci revize',
    });
    expect(revisions.map((revision) => revision.note)).toEqual([
      'Birinci revize',
      'Ikinci revize',
    ]);
    expect(revisions.every((revision) => revision.createdById === ACTOR)).toBe(
      true,
    );
  });

  it('appends a progress note when sending to review, and skips it when empty', async () => {
    const { service, cards, progressNotes } = setup([
      {
        id: 'c1',
        boardId: 'b1',
        title: 'A',
        column: 'IN_PROGRESS',
        position: 0,
        assigneeUserId: ACTOR,
      },
    ]);
    await service.moveCard('b1', 'c1', OWNER, ACTOR, {
      column: 'IN_REVIEW',
      index: 0,
      progressNote: 'Ilk teslim',
    });
    cards[0].column = 'IN_PROGRESS';
    await service.moveCard('b1', 'c1', OWNER, ACTOR, {
      column: 'IN_REVIEW',
      index: 0,
    });
    expect(progressNotes.map((note) => note.note)).toEqual(['Ilk teslim']);
  });

  it('stamps completion info when a card is moved to DONE', async () => {
    const { service, cards } = setup([
      {
        id: 'c1',
        boardId: 'b1',
        title: 'A',
        column: 'IN_REVIEW',
        position: 0,
        assigneeUserId: ACTOR,
      },
    ]);
    await service.moveCard('b1', 'c1', OWNER, ACTOR, {
      column: 'DONE',
      index: 0,
    });
    expect(cards[0].column).toBe('DONE');
    expect(cards[0].completedAt).toBeInstanceOf(Date);
    expect(cards[0].completedById).toBe(ACTOR);
  });

  it('locks DONE cards: no move, update or delete', async () => {
    const done = [
      {
        id: 'c1',
        boardId: 'b1',
        title: 'A',
        column: 'DONE',
        position: 0,
        assigneeUserId: ACTOR,
      },
    ];
    const { service } = setup(done);
    const locked = { code: 'KANBAN_CARD_LOCKED' };
    await expect(
      service.moveCard('b1', 'c1', OWNER, ACTOR, { column: 'TODO', index: 0 }),
    ).rejects.toMatchObject(locked);
    await expect(
      service.updateCard('b1', 'c1', OWNER, ACTOR, { title: 'Yeni' }),
    ).rejects.toMatchObject(locked);
    await expect(service.removeCard('b1', 'c1', OWNER)).rejects.toMatchObject(
      locked,
    );
  });

  it('returns 404 for a card that is not on the board', async () => {
    const { service } = setup();
    await expect(
      service.removeCard('b1', 'missing', OWNER),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('keeps a partner-tenant assignee when the partner edits only the title', async () => {
    const { service, notifications } = setup(
      [
        {
          id: 'c1',
          boardId: 'b1',
          title: 'A',
          column: 'TODO',
          position: 0,
          assigneeUserId: COLLEAGUE,
        },
      ],
      [ACTOR],
    );
    const card = await service.updateCard('b1', 'c1', PARTNER, ACTOR, {
      title: 'B',
      assigneeUserId: COLLEAGUE,
    });
    expect(card.title).toBe('B');
    expect(notifications.create).not.toHaveBeenCalled();
  });
});
