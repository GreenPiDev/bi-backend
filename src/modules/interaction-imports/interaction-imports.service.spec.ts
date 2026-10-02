import { TenantContext } from '../../core/tenant/tenant-context';
import { InteractionImportsService } from './interaction-imports.service';

function runInTenant<T>(fn: () => Promise<T>): Promise<T> {
  return TenantContext.run({ tenantId: 't1', userId: 'u1', roleIds: [] }, fn);
}

async function* toAsyncIterable<T>(items: T[]): AsyncIterable<T> {
  for (const item of items) {
    yield item;
  }
}

const fakeAudit = { log: vi.fn() } as never;
const fakeAccountsCache = { invalidate: vi.fn() } as never;
const fakeInteractionsCache = { invalidate: vi.fn() } as never;
const fakeInteractionTypeOptions = { create: vi.fn() } as never;

function createFileParser(headers: string[], rows: string[][]) {
  return {
    parse: vi.fn().mockResolvedValue({ headers, rows: toAsyncIterable(rows) }),
  } as never;
}

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';

function createPrisma(existingInteractions: Record<string, unknown>[] = []) {
  const interactions = new Map(
    existingInteractions.map((i) => [i.id as string, { ...i }]),
  );
  let nextId = interactions.size + 1;
  return {
    account: {
      findFirst: vi
        .fn()
        .mockResolvedValue({ id: ACCOUNT_ID, name: 'ACME A.S.' }),
      create: vi.fn(),
    },
    contact: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
    },
    interactionTypeOption: {
      findFirst: vi.fn().mockResolvedValue({ label: 'TELEFON' }),
    },
    interaction: {
      findMany: vi.fn().mockResolvedValue(Array.from(interactions.values())),
      create: vi
        .fn()
        .mockImplementation(({ data }: { data: Record<string, unknown> }) => {
          const interaction = { id: `int-${nextId++}`, ...data };
          interactions.set(interaction.id, interaction);
          return Promise.resolve(interaction);
        }),
      update: vi
        .fn()
        .mockImplementation(
          ({
            where,
            data,
          }: {
            where: { id: string };
            data: Record<string, unknown>;
          }) => {
            const existing = interactions.get(where.id) ?? {};
            const merged = { ...existing, ...data };
            interactions.set(where.id, merged);
            return Promise.resolve(merged);
          },
        ),
    },
  };
}

function createService(prisma: unknown, fileParser: unknown) {
  return new InteractionImportsService(
    prisma as never,
    fileParser as never,
    fakeAccountsCache,
    fakeInteractionsCache,
    fakeInteractionTypeOptions,
    fakeAudit,
  );
}

describe('InteractionImportsService.importInteractions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ayni firma + ayni gun + ayni gorusme sekli ikinci kez gelirse gunceller, duplike olusturmaz', async () => {
    const prisma = createPrisma([
      {
        id: 'int1',
        accountId: ACCOUNT_ID,
        contactId: null,
        occurredAt: new Date('2026-07-08T00:00:00.000Z'),
        type: 'TELEFON',
        subject: 'Eski konu',
        notes: 'Eski not',
      },
    ]);
    const service = createService(
      prisma,
      createFileParser(
        ['Firma', 'Sekil', 'Tarih', 'Konu'],
        [['ACME A.S.', 'Telefon', '08.07.2026', 'Yeni konu']],
      ),
    );

    const result = await runInTenant(() =>
      service.importInteractions(
        'u1',
        '/tmp/f.xlsx',
        'XLSX' as never,
        0,
        {
          accountName: 'Firma',
          type: 'Sekil',
          occurredAt: 'Tarih',
          subject: 'Konu',
        },
        [],
      ),
    );

    expect(result.created).toBe(0);
    expect(result.updated).toBe(1);
    expect(prisma.interaction.update).toHaveBeenCalledTimes(1);
    expect(prisma.interaction.create).not.toHaveBeenCalled();
    const [[updateCall]] = prisma.interaction.update.mock.calls;
    expect(updateCall.data.subject).toBe('Yeni konu');
    // "Notlar" dosyada eslenmemis, mevcut not silinmemeli
    expect(updateCall.data).not.toHaveProperty('notes');
  });

  it('farkli tarihli satir ayri (yeni) gorusme olarak eklenir', async () => {
    const prisma = createPrisma([
      {
        id: 'int1',
        accountId: ACCOUNT_ID,
        contactId: null,
        occurredAt: new Date('2026-07-08T00:00:00.000Z'),
        type: 'TELEFON',
      },
    ]);
    const service = createService(
      prisma,
      createFileParser(
        ['Firma', 'Sekil', 'Tarih'],
        [['ACME A.S.', 'Telefon', '09.07.2026']],
      ),
    );

    const result = await runInTenant(() =>
      service.importInteractions(
        'u1',
        '/tmp/f.xlsx',
        'XLSX' as never,
        0,
        { accountName: 'Firma', type: 'Sekil', occurredAt: 'Tarih' },
        [],
      ),
    );

    expect(result.created).toBe(1);
    expect(result.updated).toBe(0);
  });

  it('eslesen kayit yoksa (ilk yukleme) yeni gorusme olusturur', async () => {
    const prisma = createPrisma([]);
    const service = createService(
      prisma,
      createFileParser(
        ['Firma', 'Sekil', 'Tarih'],
        [['ACME A.S.', 'Telefon', '08.07.2026']],
      ),
    );

    const result = await runInTenant(() =>
      service.importInteractions(
        'u1',
        '/tmp/f.xlsx',
        'XLSX' as never,
        0,
        { accountName: 'Firma', type: 'Sekil', occurredAt: 'Tarih' },
        [],
      ),
    );

    expect(result.created).toBe(1);
    expect(result.updated).toBe(0);
  });
});
