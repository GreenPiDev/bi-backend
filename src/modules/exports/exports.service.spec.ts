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

function createQuotePdf() {
  return { render: vi.fn().mockResolvedValue(Buffer.from('quote-pdf-bytes')) };
}

function createQuotes(status: string = 'APPROVED') {
  return { getById: vi.fn().mockResolvedValue({ id: QUOTE_ID, status }) };
}

const QUOTE_ID = '44444444-4444-4444-4444-444444444444';

function buildService(overrides: Partial<Record<string, unknown>> = {}) {
  return new ExportsService(
    (overrides.widgets ?? createWidgets()) as never,
    (overrides.query ?? createQuery()) as never,
    (overrides.dashboards ?? createDashboards()) as never,
    (overrides.quotes ?? createQuotes()) as never,
    (overrides.tokenService ?? createTokenService()) as never,
    (overrides.dashboardPdf ?? createDashboardPdf()) as never,
    (overrides.quotePdf ?? createQuotePdf()) as never,
  );
}

describe('ExportsService', () => {
  it('exportWidgetCsv: widget query sonucunu CSV metnine cevirir', async () => {
    const widgets = createWidgets();
    const query = createQuery();
    const service = buildService({ widgets, query });
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
    const service = buildService({ dashboards, tokenService, dashboardPdf });
    const user = {
      id: 'u1',
      tenantId: TENANT_ID,
      roleIds: ['role-1'],
      isPlatformAdmin: false,
    };
    const pdf = await service.exportDashboardPdf(DASHBOARD_ID, user);
    expect(dashboards.requireDashboard).toHaveBeenCalledWith(DASHBOARD_ID);
    expect(tokenService.signAccessToken).toHaveBeenCalledWith({
      sub: 'u1',
      tenantId: TENANT_ID,
      roleIds: ['role-1'],
      isPlatformAdmin: false,
    });
    expect(dashboardPdf.render).toHaveBeenCalledWith(
      DASHBOARD_ID,
      'signed-token',
    );
    expect(pdf.toString()).toBe('pdf-bytes');
  });

  it('exportQuotePdf: APPROVED teklif icin PDF uretir', async () => {
    const quotes = createQuotes('APPROVED');
    const quotePdf = createQuotePdf();
    const service = buildService({ quotes, quotePdf });
    const user = {
      id: 'u1',
      tenantId: TENANT_ID,
      roleIds: ['role-1'],
      isPlatformAdmin: false,
    };
    const pdf = await service.exportQuotePdf(QUOTE_ID, user);
    expect(quotePdf.render).toHaveBeenCalledWith(QUOTE_ID, 'signed-token');
    expect(pdf.toString()).toBe('quote-pdf-bytes');
  });

  it('exportQuotePdf: PENDING_APPROVAL teklif icin QUOTE_NOT_READY firlatir', async () => {
    const service = buildService({ quotes: createQuotes('PENDING_APPROVAL') });
    const user = {
      id: 'u1',
      tenantId: TENANT_ID,
      roleIds: ['role-1'],
      isPlatformAdmin: false,
    };
    await expect(service.exportQuotePdf(QUOTE_ID, user)).rejects.toMatchObject({
      code: 'QUOTE_NOT_READY',
    });
  });
});
