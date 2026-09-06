import { AppException } from '../../core/errors/app.exception';
import { OpportunitiesService } from './opportunities.service';

const auditLog = vi.fn();
const fakeAudit = { log: auditLog } as never;

function createOpportunityRow(
  overrides: Partial<Record<string, unknown>> = {},
) {
  return {
    id: 'opp-1',
    accountId: 'account-1',
    name: 'Yeni sunucu ihtiyaci',
    stage: 'NEW',
    ...overrides,
  };
}

function createPrisma(row: unknown = createOpportunityRow()) {
  return {
    opportunity: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      findFirst: vi.fn().mockResolvedValue(row),
      create: vi.fn().mockResolvedValue(row),
      update: vi.fn().mockResolvedValue(row),
      delete: vi.fn().mockResolvedValue(row),
    },
  };
}

describe('OpportunitiesService', () => {
  it('getById: bulunamayan firsat icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma(null);
    const service = new OpportunitiesService(prisma as never, fakeAudit);
    await expect(service.getById('yok')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<AppException>);
  });

  it('create: firsati olusturur ve audit log yazar', async () => {
    const prisma = createPrisma();
    const service = new OpportunitiesService(prisma as never, fakeAudit);
    await service.create('user-1', {
      accountId: 'account-1',
      name: 'Yeni sunucu ihtiyaci',
    } as never);
    expect(prisma.opportunity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'Yeni sunucu ihtiyaci' }),
      }),
    );
    expect(auditLog).toHaveBeenCalled();
  });

  it('update: bulunamayan firsat icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma(null);
    const service = new OpportunitiesService(prisma as never, fakeAudit);
    await expect(
      service.update('yok', { name: 'x' } as never),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('remove: firsati siler ve audit log yazar', async () => {
    const prisma = createPrisma();
    const service = new OpportunitiesService(prisma as never, fakeAudit);
    await service.remove('opp-1');
    expect(prisma.opportunity.delete).toHaveBeenCalledWith({
      where: { id: 'opp-1' },
    });
  });
});
