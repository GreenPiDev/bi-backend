import { ExportsService } from './exports.service';

const WIDGET_ID = '11111111-1111-1111-1111-111111111111';
const DASHBOARD_ID = '22222222-2222-2222-2222-222222222222';
const TENANT_ID = 't1';

function createWidgets() {
  return {
    findByIdAcrossDashboards: vi.fn().mockResolvedValue({
      id: WIDGET_ID,
      dashboardId: DASHBOARD_ID,
      querySpec: {
        datasetId: '33333333-3333-3333-3333-333333333333',
        measures: [{ field: 'tutar', agg: 'sum', alias: 'toplam' }],
        dimensions: [],
        filters: [],
        orderBy: [],
      },
    }),
  };
}

function createQuery() {
  return {
    runQuery: vi.fn().mockResolvedValue({
      columns: [{ name: 'toplam', type: 'NUMBER', label: 'Toplam' }],
      rows: [[4200]],
      rowCount: 1,
      executionMs: 1,
      truncated: false,
    }),
  };
}

function createDashboards() {
  return { requireDashboard: vi.fn().mockResolvedValue({ id: DASHBOARD_ID }) };
}

function createTokenService() {
  return { signAccessToken: vi.fn().mockReturnValue('signed-token') };
}

function createDashboardPdf() {
  return { render: vi.fn().mockResolvedValue(Buffer.from('pdf-bytes')) };
}

describe('ExportsService', () => {
  it('exportWidgetCsv: widget query sonucunu CSV metnine cevirir', async () => {
    const widgets = createWidgets();
    const query = createQuery();
    const service = new ExportsService(
      widgets as never,
      query as never,
      createDashboards() as never,
      createTokenService() as never,
      createDashboardPdf() as never,
    );
    const csv = await service.exportWidgetCsv(WIDGET_ID, TENANT_ID);
    expect(widgets.findByIdAcrossDashboards).toHaveBeenCalledWith(WIDGET_ID);
    expect(query.runQuery).toHaveBeenCalledWith(
      expect.objectContaining({ datasetId: expect.any(String) }),
      TENANT_ID,
    );
    expect(csv).toBe('Toplam\r\n4200');
  });

  it('exportDashboardPdf: pano sahipligini dogrulayip kisa omurlu token uretir', async () => {
    const dashboards = createDashboards();
    const tokenService = createTokenService();
    const dashboardPdf = createDashboardPdf();
    const service = new ExportsService(
      createWidgets() as never,
      createQuery() as never,
      dashboards as never,
      tokenService as never,
      dashboardPdf as never,
    );
    const user = {
      id: 'u1',
      tenantId: TENANT_ID,
      role: 'OWNER' as const,
      isPlatformAdmin: false,
    };
    const pdf = await service.exportDashboardPdf(DASHBOARD_ID, user);
    expect(dashboards.requireDashboard).toHaveBeenCalledWith(DASHBOARD_ID);
    expect(tokenService.signAccessToken).toHaveBeenCalledWith({
      sub: 'u1',
      tenantId: TENANT_ID,
      role: 'OWNER',
      isPlatformAdmin: false,
    });
    expect(dashboardPdf.render).toHaveBeenCalledWith(
      DASHBOARD_ID,
      'signed-token',
    );
    expect(pdf.toString()).toBe('pdf-bytes');
  });
});
