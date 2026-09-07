import { AppException } from '../../core/errors/app.exception';
import { ProjectsService } from './projects.service';

const auditLog = vi.fn();
const fakeAudit = { log: auditLog } as never;

function createProjectRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'project-1',
    accountId: 'account-1',
    quoteId: null,
    projectNumber: 'PRJ-2026-09-07-001',
    name: 'Depo genisletme',
    estimatedBudget: '10000.00',
    actualCost: null,
    ...overrides,
  };
}

function createPrisma(
  options: {
    projectRow?: unknown;
    quoteRow?: unknown;
  } = {},
) {
  const {
    projectRow = createProjectRow(),
    quoteRow = { id: 'quote-1', accountId: 'account-1' },
  } = options;
  return {
    project: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      findFirst: vi.fn().mockResolvedValue(projectRow),
      create: vi.fn().mockResolvedValue(projectRow),
      update: vi.fn().mockResolvedValue(projectRow),
      delete: vi.fn().mockResolvedValue(projectRow),
    },
    quote: {
      findFirst: vi.fn().mockResolvedValue(quoteRow),
    },
  };
}

describe('ProjectsService', () => {
  it('getById: bulunamayan proje icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma({ projectRow: null });
    const service = new ProjectsService(prisma as never, fakeAudit);
    await expect(service.getById('yok')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<AppException>);
  });

  it('create: PRJ-YYYY-AA-GG-NNN formatinda numara uretir ve audit log yazar', async () => {
    const prisma = createPrisma();
    const service = new ProjectsService(prisma as never, fakeAudit);
    await service.create('user-1', {
      accountId: 'account-1',
      name: 'Depo genisletme',
      estimatedBudget: 10000,
    } as never);
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

  it('create: quoteId verilen teklif baska bir firmaya aitse QUOTE_ACCOUNT_MISMATCH firlatir', async () => {
    const prisma = createPrisma({
      quoteRow: { id: 'quote-1', accountId: 'baska-firma' },
    });
    const service = new ProjectsService(prisma as never, fakeAudit);
    await expect(
      service.create('user-1', {
        accountId: 'account-1',
        quoteId: 'quote-1',
        name: 'Depo genisletme',
        estimatedBudget: 10000,
      } as never),
    ).rejects.toMatchObject({ code: 'QUOTE_ACCOUNT_MISMATCH' });
    expect(prisma.project.create).not.toHaveBeenCalled();
  });

  it('update: bulunamayan proje icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma({ projectRow: null });
    const service = new ProjectsService(prisma as never, fakeAudit);
    await expect(
      service.update('yok', { name: 'x' } as never),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('remove: projeyi siler ve audit log yazar', async () => {
    const prisma = createPrisma();
    const service = new ProjectsService(prisma as never, fakeAudit);
    await service.remove('project-1');
    expect(prisma.project.delete).toHaveBeenCalledWith({
      where: { id: 'project-1' },
    });
    expect(auditLog).toHaveBeenCalled();
  });
});
