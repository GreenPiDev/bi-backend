import { AppException } from '../../core/errors/app.exception';
import { TenantContext } from '../../core/tenant/tenant-context';
import { ProjectsService } from './projects.service';

function runInTenant<T>(fn: () => Promise<T>): Promise<T> {
  return TenantContext.run(
    { tenantId: 't1', userId: 'user-1', roleIds: [] },
    fn,
  );
}

const auditLog = vi.fn();
const fakeAudit = { log: auditLog } as never;
const fakeCache = {
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn(),
  invalidate: vi.fn(),
} as never;

function createProjectRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'project-1',
    accountId: 'account-1',
    projectNumber: 'PRJ-2026-09-07-001',
    name: 'Depo genisletme',
    estimatedBudget: '10000.00',
    actualCost: null,
    quotes: [],
    ...overrides,
  };
}

function createPrisma(
  options: {
    projectRow?: unknown;
    quoteRows?: unknown[];
  } = {},
) {
  const {
    projectRow = createProjectRow(),
    quoteRows = [{ id: 'quote-1', accountId: 'account-1', projectId: null }],
  } = options;
  const tx = {
    project: {
      update: vi.fn().mockResolvedValue(projectRow),
    },
    quote: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
  return {
    account: {
      findFirst: vi.fn().mockResolvedValue({ id: 'account-1' }),
    },
    project: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      findFirst: vi.fn().mockResolvedValue(projectRow),
      create: vi.fn().mockResolvedValue(projectRow),
      delete: vi.fn().mockResolvedValue(projectRow),
    },
    quote: {
      findMany: vi.fn().mockResolvedValue(quoteRows),
    },
    $queryRaw: vi.fn().mockResolvedValue([{ count: 0n }]),
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(tx)),
    __tx: tx,
  };
}

describe('ProjectsService', () => {
  it('getById: bulunamayan proje icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma({ projectRow: null });
    const service = new ProjectsService(prisma as never, fakeAudit, fakeCache);
    await expect(service.getById('yok')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<AppException>);
  });

  it('create: PRJ-YYYY-AA-GG-NNN formatinda numara uretir ve audit log yazar', async () => {
    const prisma = createPrisma();
    const service = new ProjectsService(prisma as never, fakeAudit, fakeCache);
    await runInTenant(() =>
      service.create('user-1', {
        accountId: 'account-1',
        name: 'Depo genisletme',
        estimatedBudget: 10000,
      } as never),
    );
    expect(prisma.project.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Depo genisletme',
          projectNumber: expect.stringMatching(/^PRJ-\d{4}-\d{2}-\d{2}-\d{3}$/),
        }),
      }),
    );
    expect(auditLog).toHaveBeenCalled();
  });

  it('update: bulunamayan proje icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma({ projectRow: null });
    const service = new ProjectsService(prisma as never, fakeAudit, fakeCache);
    await expect(
      service.update('yok', { name: 'x' } as never),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('update: quoteIds ile verilen teklif baska bir firmaya aitse QUOTE_ACCOUNT_MISMATCH firlatir', async () => {
    const prisma = createPrisma({
      quoteRows: [{ id: 'quote-1', accountId: 'baska-firma', projectId: null }],
    });
    const service = new ProjectsService(prisma as never, fakeAudit, fakeCache);
    await expect(
      service.update('project-1', { quoteIds: ['quote-1'] } as never),
    ).rejects.toMatchObject({ code: 'QUOTE_ACCOUNT_MISMATCH' });
    expect(prisma.__tx.quote.updateMany).not.toHaveBeenCalled();
  });

  it('update: quoteIds ile verilen teklif baska bir projeye zaten bagliysa QUOTE_ALREADY_LINKED_TO_PROJECT firlatir', async () => {
    const prisma = createPrisma({
      quoteRows: [
        { id: 'quote-1', accountId: 'account-1', projectId: 'other-project' },
      ],
    });
    const service = new ProjectsService(prisma as never, fakeAudit, fakeCache);
    await expect(
      service.update('project-1', { quoteIds: ['quote-1'] } as never),
    ).rejects.toMatchObject({ code: 'QUOTE_ALREADY_LINKED_TO_PROJECT' });
    expect(prisma.__tx.quote.updateMany).not.toHaveBeenCalled();
  });

  it('update: quoteIds verilince onceki iliskiyi kaldirip yenisini kurar (replace semantigi)', async () => {
    const prisma = createPrisma({
      quoteRows: [{ id: 'quote-2', accountId: 'account-1', projectId: null }],
    });
    const service = new ProjectsService(prisma as never, fakeAudit, fakeCache);
    await service.update('project-1', { quoteIds: ['quote-2'] } as never);

    expect(prisma.__tx.quote.updateMany).toHaveBeenNthCalledWith(1, {
      where: { projectId: 'project-1' },
      data: { projectId: null },
    });
    expect(prisma.__tx.quote.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: { in: ['quote-2'] } },
      data: { projectId: 'project-1' },
    });
    expect(auditLog).toHaveBeenCalled();
  });

  it('update: bos quoteIds verilince sadece mevcut iliskiler kaldirilir', async () => {
    const prisma = createPrisma();
    const service = new ProjectsService(prisma as never, fakeAudit, fakeCache);
    await service.update('project-1', { quoteIds: [] } as never);

    expect(prisma.quote.findMany).not.toHaveBeenCalled();
    expect(prisma.__tx.quote.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.__tx.quote.updateMany).toHaveBeenCalledWith({
      where: { projectId: 'project-1' },
      data: { projectId: null },
    });
  });

  it('remove: projeyi siler ve audit log yazar', async () => {
    const prisma = createPrisma();
    const service = new ProjectsService(prisma as never, fakeAudit, fakeCache);
    await service.remove('project-1');
    expect(prisma.project.delete).toHaveBeenCalledWith({
      where: { id: 'project-1' },
    });
    expect(auditLog).toHaveBeenCalled();
  });
});
