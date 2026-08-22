import { AppException } from '../../core/errors/app.exception';
import { DashboardsService } from './dashboards.service';

const fakeAudit = { log: vi.fn() } as never;

const DASHBOARD_ID = '11111111-1111-1111-1111-111111111111';
const TENANT_ID = 't1';
const USER_ID = 'u1';

function createDashboardRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: DASHBOARD_ID,
    tenantId: TENANT_ID,
    name: 'Satis Panosu',
    description: null,
    layout: [],
    filters: [],
    createdById: USER_ID,
    widgets: [],
    ...overrides,
  };
}

function createPrisma(dashboardRow: unknown = createDashboardRow()) {
  return {
    dashboard: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(dashboardRow),
      create: vi.fn().mockResolvedValue(dashboardRow),
      update: vi.fn().mockResolvedValue(dashboardRow),
      delete: vi.fn().mockResolvedValue(dashboardRow),
    },
  };
}

describe('DashboardsService', () => {
  it('getById: bulunamayan pano icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma(null);
    const service = new DashboardsService(prisma as never, fakeAudit);
    await expect(service.getById('yok')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<AppException>);
  });

  it('create: tenantId ve createdById ile pano olusturur', async () => {
    const prisma = createPrisma();
    const service = new DashboardsService(prisma as never, fakeAudit);
    await service.create(TENANT_ID, USER_ID, { name: 'Satis Panosu' });
    expect(prisma.dashboard.create).toHaveBeenCalledWith({
      data: {
        tenantId: TENANT_ID,
        createdById: USER_ID,
        name: 'Satis Panosu',
        description: undefined,
      },
    });
  });

  it('update: bulunamayan pano icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma(null);
    const service = new DashboardsService(prisma as never, fakeAudit);
    await expect(
      service.update(DASHBOARD_ID, { name: 'x' }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<AppException>);
    expect(prisma.dashboard.update).not.toHaveBeenCalled();
  });

  it('update: layout alanini gunceller', async () => {
    const prisma = createPrisma();
    const service = new DashboardsService(prisma as never, fakeAudit);
    const layout = [{ widgetId: DASHBOARD_ID, x: 0, y: 0, w: 4, h: 2 }];
    await service.update(DASHBOARD_ID, { layout });
    expect(prisma.dashboard.update).toHaveBeenCalledWith({
      where: { id: DASHBOARD_ID },
      data: {
        name: undefined,
        description: undefined,
        layout,
        filters: undefined,
      },
    });
  });

  it('remove: bulunamayan pano icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma(null);
    const service = new DashboardsService(prisma as never, fakeAudit);
    await expect(service.remove(DASHBOARD_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<AppException>);
    expect(prisma.dashboard.delete).not.toHaveBeenCalled();
  });

  it('remove: mevcut panoyu siler', async () => {
    const prisma = createPrisma();
    const service = new DashboardsService(prisma as never, fakeAudit);
    await service.remove(DASHBOARD_ID);
    expect(prisma.dashboard.delete).toHaveBeenCalledWith({
      where: { id: DASHBOARD_ID },
    });
  });
});
