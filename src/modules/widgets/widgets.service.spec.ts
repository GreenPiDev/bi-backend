import { AppException } from '../../core/errors/app.exception';
import { WidgetsService } from './widgets.service';

const DASHBOARD_ID = '11111111-1111-1111-1111-111111111111';
const WIDGET_ID = '22222222-2222-2222-2222-222222222222';
const DATASET_ID = '33333333-3333-3333-3333-333333333333';

function createWidgetRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: WIDGET_ID,
    dashboardId: DASHBOARD_ID,
    type: 'kpi',
    title: 'Toplam Ciro',
    querySpec: {
      datasetId: DATASET_ID,
      measures: [{ field: 'tutar', agg: 'sum', alias: 'toplam' }],
      dimensions: [],
      filters: [],
      orderBy: [],
    },
    vizOptions: {},
    position: { x: 0, y: 0, w: 2, h: 2 },
    ...overrides,
  };
}

function createPrisma(widgetRow: unknown = createWidgetRow()) {
  return {
    widget: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(widgetRow),
      create: vi.fn().mockResolvedValue(widgetRow),
      update: vi.fn().mockResolvedValue(widgetRow),
      delete: vi.fn().mockResolvedValue(widgetRow),
    },
  };
}

function createDashboardsService(found = true) {
  return {
    requireDashboard: vi
      .fn()
      .mockImplementation(() =>
        found
          ? Promise.resolve({ id: DASHBOARD_ID, widgets: [] })
          : Promise.reject(
              new AppException('NOT_FOUND', 'Pano bulunamadi.', 404),
            ),
      ),
  };
}

describe('WidgetsService', () => {
  it('create: dashboard baska tenanta aitse NOT_FOUND firlatir, widget olusturulmaz', async () => {
    const prisma = createPrisma();
    const dashboards = createDashboardsService(false);
    const service = new WidgetsService(prisma as never, dashboards as never);
    await expect(
      service.create(DASHBOARD_ID, createWidgetRow() as never),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<AppException>);
    expect(prisma.widget.create).not.toHaveBeenCalled();
  });

  it('create: dashboard sahipligi dogrulanip widget olusturur', async () => {
    const prisma = createPrisma();
    const dashboards = createDashboardsService(true);
    const service = new WidgetsService(prisma as never, dashboards as never);
    await service.create(DASHBOARD_ID, createWidgetRow() as never);
    expect(dashboards.requireDashboard).toHaveBeenCalledWith(DASHBOARD_ID);
    expect(prisma.widget.create).toHaveBeenCalled();
  });

  it('update: widget baska dashboardId altinda aranirsa NOT_FOUND firlatir', async () => {
    const prisma = createPrisma(null);
    const dashboards = createDashboardsService(true);
    const service = new WidgetsService(prisma as never, dashboards as never);
    await expect(
      service.update(DASHBOARD_ID, WIDGET_ID, { title: 'x' }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<AppException>);
    expect(prisma.widget.update).not.toHaveBeenCalled();
  });

  it('update: findFirst dashboardId+id ile filtrelenir (cross-dashboard erisim engellenir)', async () => {
    const prisma = createPrisma();
    const dashboards = createDashboardsService(true);
    const service = new WidgetsService(prisma as never, dashboards as never);
    await service.update(DASHBOARD_ID, WIDGET_ID, { title: 'Yeni Baslik' });
    expect(prisma.widget.findFirst).toHaveBeenCalledWith({
      where: { id: WIDGET_ID, dashboardId: DASHBOARD_ID },
    });
    expect(prisma.widget.update).toHaveBeenCalledWith({
      where: { id: WIDGET_ID },
      data: expect.objectContaining({ title: 'Yeni Baslik' }),
    });
  });

  it('remove: bulunamayan widget icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma(null);
    const dashboards = createDashboardsService(true);
    const service = new WidgetsService(prisma as never, dashboards as never);
    await expect(service.remove(DASHBOARD_ID, WIDGET_ID)).rejects.toMatchObject(
      { code: 'NOT_FOUND' } satisfies Partial<AppException>,
    );
    expect(prisma.widget.delete).not.toHaveBeenCalled();
  });
});
