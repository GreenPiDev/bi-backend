import { AppException } from '../../core/errors/app.exception';
import { OnboardingService } from './onboarding.service';

const TENANT_ID = 't1';
const USER_ID = 'u1';
const DATASET_ID = '11111111-1111-4111-8111-111111111111';
const DASHBOARD_ID = 'd1';

function createField(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'f1',
    datasetId: DATASET_ID,
    sourceName: 'Toplam Tutar',
    name: 'toplam_tutar',
    label: 'Toplam Tutar',
    type: 'NUMBER',
    role: 'MEASURE',
    format: null,
    isVisible: true,
    ordinal: 0,
    ...overrides,
  };
}

function createPrisma() {
  return {
    dataSource: {
      create: vi.fn().mockResolvedValue({ id: 'ds1' }),
    },
  };
}

function createQueue() {
  return { add: vi.fn().mockResolvedValue(undefined) };
}

function createCollaborators(fields: unknown[]) {
  const datasets = {
    getById: vi.fn().mockResolvedValue({
      id: DATASET_ID,
      name: 'Perakende Satis',
      fields,
    }),
  };
  const dashboards = {
    create: vi.fn().mockResolvedValue({ id: DASHBOARD_ID }),
    update: vi.fn().mockResolvedValue(undefined),
  };
  let widgetSeq = 0;
  const widgets = {
    create: vi
      .fn()
      .mockImplementation(() => Promise.resolve({ id: `w${++widgetSeq}` })),
  };
  return { datasets, dashboards, widgets };
}

describe('OnboardingService', () => {
  it('seedDemoDataset: PENDING durumunda DataSource olusturur ve ingest kuyruguna ekler', async () => {
    const prisma = createPrisma();
    const queue = createQueue();
    const { datasets, dashboards, widgets } = createCollaborators([]);
    const service = new OnboardingService(
      prisma as never,
      queue as never,
      datasets as never,
      dashboards as never,
      widgets as never,
    );

    const result = await service.seedDemoDataset(TENANT_ID, USER_ID);

    expect(result).toEqual({ id: 'ds1' });
    expect(prisma.dataSource.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: TENANT_ID,
          createdById: USER_ID,
          status: 'PENDING',
          type: 'CSV',
        }),
      }),
    );
    expect(queue.add).toHaveBeenCalledWith(
      'ingest-datasource',
      expect.objectContaining({ dataSourceId: 'ds1', tenantId: TENANT_ID }),
    );
  });

  it('createStarterDashboard: olcu alani yoksa NO_MEASURE_FIELD firlatir', async () => {
    const prisma = createPrisma();
    const queue = createQueue();
    const { datasets, dashboards, widgets } = createCollaborators([
      createField({ role: 'DIMENSION' }),
    ]);
    const service = new OnboardingService(
      prisma as never,
      queue as never,
      datasets as never,
      dashboards as never,
      widgets as never,
    );

    await expect(
      service.createStarterDashboard(DATASET_ID, TENANT_ID, USER_ID),
    ).rejects.toMatchObject({
      code: 'NO_MEASURE_FIELD',
    } satisfies Partial<AppException>);
    expect(dashboards.create).not.toHaveBeenCalled();
  });

  it('createStarterDashboard: sadece olcu varsa tek KPI widgeti olusturur', async () => {
    const prisma = createPrisma();
    const queue = createQueue();
    const { datasets, dashboards, widgets } = createCollaborators([
      createField(),
    ]);
    const service = new OnboardingService(
      prisma as never,
      queue as never,
      datasets as never,
      dashboards as never,
      widgets as never,
    );

    await service.createStarterDashboard(DATASET_ID, TENANT_ID, USER_ID);

    expect(dashboards.create).toHaveBeenCalledWith(TENANT_ID, USER_ID, {
      name: 'Perakende Satis - Ilk Panom',
    });
    expect(widgets.create).toHaveBeenCalledTimes(1);
    expect(widgets.create).toHaveBeenCalledWith(
      DASHBOARD_ID,
      expect.objectContaining({ type: 'kpi' }),
    );
    expect(dashboards.update).toHaveBeenCalledWith(DASHBOARD_ID, {
      layout: [{ widgetId: 'w1', x: 0, y: 0, w: 3, h: 2 }],
    });
  });

  it('createStarterDashboard: tarih ve boyut alani varsa trend + kirilim widgetlari da ekler', async () => {
    const prisma = createPrisma();
    const queue = createQueue();
    const { datasets, dashboards, widgets } = createCollaborators([
      createField(),
      createField({
        id: 'f2',
        sourceName: 'Satis Tarihi',
        name: 'satis_tarihi',
        label: 'Satis Tarihi',
        type: 'DATE',
        role: 'DATE',
      }),
      createField({
        id: 'f3',
        sourceName: 'Sehir',
        name: 'sehir',
        label: 'Sehir',
        type: 'STRING',
        role: 'DIMENSION',
      }),
    ]);
    const service = new OnboardingService(
      prisma as never,
      queue as never,
      datasets as never,
      dashboards as never,
      widgets as never,
    );

    await service.createStarterDashboard(DATASET_ID, TENANT_ID, USER_ID);

    expect(widgets.create).toHaveBeenCalledTimes(3);
    expect(widgets.create).toHaveBeenNthCalledWith(
      2,
      DASHBOARD_ID,
      expect.objectContaining({
        type: 'line',
        querySpec: expect.objectContaining({
          dimensions: [{ field: 'satis_tarihi', granularity: 'month' }],
        }),
      }),
    );
    expect(widgets.create).toHaveBeenNthCalledWith(
      3,
      DASHBOARD_ID,
      expect.objectContaining({
        type: 'bar',
        querySpec: expect.objectContaining({
          dimensions: [{ field: 'sehir', granularity: undefined }],
        }),
      }),
    );
    expect(dashboards.update).toHaveBeenCalledWith(DASHBOARD_ID, {
      layout: [
        { widgetId: 'w1', x: 0, y: 0, w: 3, h: 2 },
        { widgetId: 'w2', x: 3, y: 0, w: 5, h: 4 },
        { widgetId: 'w3', x: 0, y: 2, w: 3, h: 4 },
      ],
    });
  });

  it('createStarterDashboard: gorunmez alanlari yok sayar', async () => {
    const prisma = createPrisma();
    const queue = createQueue();
    const { datasets, dashboards, widgets } = createCollaborators([
      createField({ isVisible: false }),
    ]);
    const service = new OnboardingService(
      prisma as never,
      queue as never,
      datasets as never,
      dashboards as never,
      widgets as never,
    );

    await expect(
      service.createStarterDashboard(DATASET_ID, TENANT_ID, USER_ID),
    ).rejects.toMatchObject({
      code: 'NO_MEASURE_FIELD',
    } satisfies Partial<AppException>);
  });
});
