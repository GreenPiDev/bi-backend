import { HttpStatus, Injectable } from '@nestjs/common';
import type { RequestUser } from '../../core/decorators/current-user.decorator';
import { AppException } from '../../core/errors/app.exception';
import { DashboardsService } from '../dashboards/dashboards.service';
import type { QuerySpec } from '../query/dto/query-spec.dto';
import { QueryService } from '../query/query.service';
import { QuotesService } from '../quotes/quotes.service';
import { TokenService } from '../auth/token.service';
import { WidgetsService } from '../widgets/widgets.service';
import { buildCsv } from './csv';
import { DashboardPdfService } from './dashboard-pdf.service';
import { QuotePdfService } from './quote-pdf.service';
import { isKnownReportTab, ReportPdfService } from './report-pdf.service';

const QUOTE_EXPORTABLE_STATUSES = new Set(['DRAFT', 'APPROVED']);

@Injectable()
export class ExportsService {
  constructor(
    private readonly widgets: WidgetsService,
    private readonly query: QueryService,
    private readonly dashboards: DashboardsService,
    private readonly quotes: QuotesService,
    private readonly tokenService: TokenService,
    private readonly dashboardPdf: DashboardPdfService,
    private readonly quotePdf: QuotePdfService,
    private readonly reportPdf: ReportPdfService,
  ) {}

  async exportWidgetCsv(widgetId: string, tenantId: string): Promise<string> {
    const widget = await this.widgets.findByIdAcrossDashboards(widgetId);
    const querySpec = widget.querySpec as unknown as QuerySpec;
    const result = await this.query.runQuery(querySpec, tenantId);
    return buildCsv(result.columns, result.rows);
  }

  async exportDashboardPdf(
    dashboardId: string,
    user: RequestUser,
  ): Promise<Buffer> {
    await this.dashboards.requireDashboard(dashboardId);
    const accessToken = this.tokenService.signAccessToken({
      sub: user.id,
      tenantId: user.tenantId,
      roleIds: user.roleIds,
      isPlatformAdmin: user.isPlatformAdmin,
    });
    return this.dashboardPdf.render(dashboardId, accessToken);
  }

  /** Q6/Q7: PENDING_APPROVAL/REJECTED durumundaki teklifler disa aktarilamaz -
   * "onaya dusme" ifadesinin pratik karsiligi, bkz. docs/VARSAYIMLAR.md V27. */
  async exportQuotePdf(quoteId: string, user: RequestUser): Promise<Buffer> {
    const quote = await this.quotes.getById(quoteId);
    if (!QUOTE_EXPORTABLE_STATUSES.has(quote.status)) {
      throw new AppException(
        'QUOTE_NOT_READY',
        'Bu teklif onay bekliyor veya reddedildi, PDF olarak disa aktarilamaz.',
        HttpStatus.CONFLICT,
      );
    }
    const accessToken = this.tokenService.signAccessToken({
      sub: user.id,
      tenantId: user.tenantId,
      roleIds: user.roleIds,
      isPlatformAdmin: user.isPlatformAdmin,
    });
    return this.quotePdf.render(quoteId, accessToken, {
      branded: quote.templateId !== null,
    });
  }

  private async requireExportableQuote(quoteId: string): Promise<void> {
    const quote = await this.quotes.getById(quoteId);
    if (!QUOTE_EXPORTABLE_STATUSES.has(quote.status)) {
      throw new AppException(
        'QUOTE_NOT_READY',
        'Bu teklif onay bekliyor veya reddedildi, PDF olarak disa aktarilamaz.',
        HttpStatus.CONFLICT,
      );
    }
  }

  /** /teklifler/:id?tab=cost ekraninin kendi PDF export'u - ana teklif PDF'inden
   * (exportQuotePdf) bagimsiz, markali sablon kullanmaz. */
  async exportQuoteCostPdf(
    quoteId: string,
    user: RequestUser,
  ): Promise<Buffer> {
    await this.requireExportableQuote(quoteId);
    const accessToken = this.tokenService.signAccessToken({
      sub: user.id,
      tenantId: user.tenantId,
      roleIds: user.roleIds,
      isPlatformAdmin: user.isPlatformAdmin,
    });
    return this.quotePdf.render(quoteId, accessToken, { tab: 'cost' });
  }

  /** /teklifler/:id?tab=charts ekraninin kendi PDF export'u - ayni gerekce. */
  async exportQuoteChartsPdf(
    quoteId: string,
    user: RequestUser,
  ): Promise<Buffer> {
    await this.requireExportableQuote(quoteId);
    const accessToken = this.tokenService.signAccessToken({
      sub: user.id,
      tenantId: user.tenantId,
      roleIds: user.roleIds,
      isPlatformAdmin: user.isPlatformAdmin,
    });
    return this.quotePdf.render(quoteId, accessToken, { tab: 'charts' });
  }

  async exportReportsPdf(tab: string, user: RequestUser): Promise<Buffer> {
    if (!isKnownReportTab(tab)) {
      throw new AppException(
        'UNKNOWN_REPORT_TAB',
        'Bilinmeyen rapor sekmesi.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const accessToken = this.tokenService.signAccessToken({
      sub: user.id,
      tenantId: user.tenantId,
      roleIds: user.roleIds,
      isPlatformAdmin: user.isPlatformAdmin,
    });
    return this.reportPdf.render(tab, accessToken);
  }
}
