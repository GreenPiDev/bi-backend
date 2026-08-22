import { AppException } from '../../core/errors/app.exception';
import { ReportsService } from './reports.service';

const fakeAudit = { log: vi.fn() } as never;
const REPORT_ID = '11111111-1111-1111-1111-111111111111';
const DASHBOARD_ID = '22222222-2222-2222-2222-222222222222';
const TENANT_ID = 't1';

function createReportRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: REPORT_ID,
    tenantId: TENANT_ID,
    dashboardId: DASHBOARD_ID,
    cron: '0 8 * * 1',
    recipients: ['a@test.com'],
    isActive: true,
    lastRunAt: null,
    ...overrides,
  };
}

function createPrisma(reportRow: unknown = createReportRow()) {
  return {
    scheduledReport: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(reportRow),
      create: vi.fn().mockResolvedValue(reportRow),
      update: vi.fn().mockResolvedValue(reportRow),
      delete: vi.fn().mockResolvedValue(reportRow),
    },
  };
}

function createRawPrisma() {
  return {
    scheduledReport: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
}

function createDashboards(found = true) {
  return {
    requireDashboard: vi
      .fn()
      .mockImplementation(() =>
        found
          ? Promise.resolve({ id: DASHBOARD_ID })
          : Promise.reject(
              new AppException('NOT_FOUND', 'Pano bulunamadi.', 404),
            ),
      ),
  };
}

function createQueue() {
  return {
    upsertJobScheduler: vi.fn().mockResolvedValue(undefined),
    removeJobScheduler: vi.fn().mockResolvedValue(true),
  };
}

describe('ReportsService', () => {
  it('create: dashboard sahipligini dogrulayip rapor olusturur ve zamanlayiciyi kaydeder', async () => {
    const prisma = createPrisma();
    const queue = createQueue();
    const dashboards = createDashboards(true);
    const service = new ReportsService(
      prisma as never,
      createRawPrisma() as never,
      dashboards as never,
      queue as never,
      fakeAudit,
    );
    await service.create(TENANT_ID, {
      dashboardId: DASHBOARD_ID,
      cron: '0 8 * * 1',
      recipients: ['a@test.com'],
      isActive: true,
    });
    expect(dashboards.requireDashboard).toHaveBeenCalledWith(DASHBOARD_ID);
    expect(prisma.scheduledReport.create).toHaveBeenCalled();
    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      REPORT_ID,
      { pattern: '0 8 * * 1' },
      { name: 'send-report', data: { reportId: REPORT_ID } },
    );
  });

  it('create: isActive false ise zamanlayici kaydedilmez', async () => {
    const prisma = createPrisma(createReportRow({ isActive: false }));
    const queue = createQueue();
    const service = new ReportsService(
      prisma as never,
      createRawPrisma() as never,
      createDashboards(true) as never,
      queue as never,
      fakeAudit,
    );
    await service.create(TENANT_ID, {
      dashboardId: DASHBOARD_ID,
      cron: '0 8 * * 1',
      recipients: ['a@test.com'],
      isActive: false,
    });
    expect(queue.upsertJobScheduler).not.toHaveBeenCalled();
  });

  it('update: bulunamayan rapor icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma(null);
    const service = new ReportsService(
      prisma as never,
      createRawPrisma() as never,
      createDashboards(true) as never,
      createQueue() as never,
      fakeAudit,
    );
    await expect(
      service.update(REPORT_ID, { isActive: false }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<AppException>);
  });

  it('update: isActive false yapilinca zamanlayici kaldirilir', async () => {
    const prisma = createPrisma(createReportRow());
    prisma.scheduledReport.update.mockResolvedValue(
      createReportRow({ isActive: false }),
    );
    const queue = createQueue();
    const service = new ReportsService(
      prisma as never,
      createRawPrisma() as never,
      createDashboards(true) as never,
      queue as never,
      fakeAudit,
    );
    await service.update(REPORT_ID, { isActive: false });
    expect(queue.removeJobScheduler).toHaveBeenCalledWith(REPORT_ID);
    expect(queue.upsertJobScheduler).not.toHaveBeenCalled();
  });

  it('remove: raporu siler ve zamanlayiciyi kaldirir', async () => {
    const prisma = createPrisma();
    const queue = createQueue();
    const service = new ReportsService(
      prisma as never,
      createRawPrisma() as never,
      createDashboards(true) as never,
      queue as never,
      fakeAudit,
    );
    await service.remove(REPORT_ID);
    expect(prisma.scheduledReport.delete).toHaveBeenCalledWith({
      where: { id: REPORT_ID },
    });
    expect(queue.removeJobScheduler).toHaveBeenCalledWith(REPORT_ID);
  });

  it('onModuleInit: aktif raporlarin zamanlayicilarini yeniden kurar', async () => {
    const rawPrisma = createRawPrisma();
    rawPrisma.scheduledReport.findMany.mockResolvedValue([createReportRow()]);
    const queue = createQueue();
    const service = new ReportsService(
      createPrisma() as never,
      rawPrisma as never,
      createDashboards(true) as never,
      queue as never,
      fakeAudit,
    );
    await service.onModuleInit();
    expect(rawPrisma.scheduledReport.findMany).toHaveBeenCalledWith({
      where: { isActive: true },
    });
    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      REPORT_ID,
      { pattern: '0 8 * * 1' },
      { name: 'send-report', data: { reportId: REPORT_ID } },
    );
  });
});
