import { HttpStatus, Injectable } from '@nestjs/common';
import type { RequestUser } from '../../core/decorators/current-user.decorator';
import { AppException } from '../../core/errors/app.exception';
import { DashboardsService } from '../dashboards/dashboards.service';
import type { QuerySpec } from '../query/dto/query-spec.dto';
import { QueryService } from '../query/query.service';
import { QuotesService } from '../quotes/quotes.service';
import { TenantsService } from '../tenants/tenants.service';
import { TokenService } from '../auth/token.service';
import { WidgetsService } from '../widgets/widgets.service';
import { buildCsv } from './csv';
import { DashboardPdfService } from './dashboard-pdf.service';
import { setPdfTitleMetadata } from './pdf-metadata';
import { buildQuotePdfFilename } from './quote-pdf-filename';
import { QuotePdfService } from './quote-pdf.service';
import { isKnownReportTab, ReportPdfService } from './report-pdf.service';

const QUOTE_EXPORTABLE_STATUSES = new Set(['DRAFT', 'SENT', 'APPROVED']);
const QUOTE_PDF_COVER_TITLE = 'Fiyat Teklifi';
const quotePdfDateFormatter = new Intl.DateTimeFormat('tr-TR');

@Injectable()
export class ExportsService {
  constructor(
    private readonly widgets: WidgetsService,
    private readonly query: QueryService,
    private readonly dashboards: DashboardsService,
    private readonly quotes: QuotesService,
    private readonly tenants: TenantsService,
    private readonly tokenService: TokenService,
    private readonly dashboardPdf: DashboardPdfService,
    private readonly quotePdf: QuotePdfService,
    private readonly reportPdf: ReportPdfService,
  ) {}

  /** Ana teklif PDF'inin (exportQuotePdf) her sayfasinda tekrar eden
   * header/footer'i (bkz. QuotePdfService) besleyen tenant-genel marka bilgisi. */
  private async getQuotePdfBranding(
    quoteId: string,
    tenantId: string,
  ): Promise<{
    header: {
      logoUrl: string | null;
      title: string;
      quoteDate: string;
      quoteNumber: string;
    };
    company: {
      address: string | null;
      phone: string | null;
      email: string | null;
    };
  }> {
    const [quote, tenantProfile] = await Promise.all([
      this.quotes.getById(quoteId),
      this.tenants.getProfile(tenantId),
    ]);
    return {
      header: {
        logoUrl: tenantProfile.logoUrl,
        title: QUOTE_PDF_COVER_TITLE,
        quoteDate: quotePdfDateFormatter.format(new Date(quote.quoteDate)),
        quoteNumber: quote.quoteNumber,
      },
      company: {
        address: tenantProfile.address,
        phone: tenantProfile.phone,
        email: tenantProfile.email,
      },
    };
  }

  /** Teklif PDF export butonlarinin ucunun indirecegi dosya adi (uzantisiz) -
   * controller bu temele ".pdf"/"-maliyet.pdf"/"-grafikler.pdf" ekler. */
  async getQuotePdfFileName(quoteId: string): Promise<string> {
    const quote = await this.quotes.getById(quoteId);
    return buildQuotePdfFilename(quote.quoteNumber, quote.account.name);
  }

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
    const { header, company } = await this.getQuotePdfBranding(
      quoteId,
      user.tenantId,
    );
    const pdf = await this.quotePdf.render(quoteId, accessToken, {
      branded: quote.templateId !== null,
      header,
      company,
    });
    return setPdfTitleMetadata(
      pdf,
      buildQuotePdfFilename(quote.quoteNumber, quote.account.name),
    );
  }

  private async requireExportableQuote(
    quoteId: string,
  ): Promise<Awaited<ReturnType<QuotesService['getById']>>> {
    const quote = await this.quotes.getById(quoteId);
    if (!QUOTE_EXPORTABLE_STATUSES.has(quote.status)) {
      throw new AppException(
        'QUOTE_NOT_READY',
        'Bu teklif onay bekliyor veya reddedildi, PDF olarak disa aktarilamaz.',
        HttpStatus.CONFLICT,
      );
    }
    return quote;
  }

  /** /teklifler/:id?tab=cost ekraninin kendi PDF export'u - ana teklif PDF'inden
   * (exportQuotePdf) bagimsiz, markali sablon kullanmaz. */
  async exportQuoteCostPdf(
    quoteId: string,
    user: RequestUser,
  ): Promise<Buffer> {
    const quote = await this.requireExportableQuote(quoteId);
    const accessToken = this.tokenService.signAccessToken({
      sub: user.id,
      tenantId: user.tenantId,
      roleIds: user.roleIds,
      isPlatformAdmin: user.isPlatformAdmin,
    });
    const pdf = await this.quotePdf.render(quoteId, accessToken, {
      tab: 'cost',
    });
    return setPdfTitleMetadata(
      pdf,
      `${buildQuotePdfFilename(quote.quoteNumber, quote.account.name)}-maliyet`,
    );
  }

  /** /teklifler/:id?tab=charts ekraninin kendi PDF export'u - ayni gerekce. */
  async exportQuoteChartsPdf(
    quoteId: string,
    user: RequestUser,
  ): Promise<Buffer> {
    const quote = await this.requireExportableQuote(quoteId);
    const accessToken = this.tokenService.signAccessToken({
      sub: user.id,
      tenantId: user.tenantId,
      roleIds: user.roleIds,
      isPlatformAdmin: user.isPlatformAdmin,
    });
    const pdf = await this.quotePdf.render(quoteId, accessToken, {
      tab: 'charts',
    });
    return setPdfTitleMetadata(
      pdf,
      `${buildQuotePdfFilename(quote.quoteNumber, quote.account.name)}-grafikler`,
    );
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
