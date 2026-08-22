import { Injectable } from '@nestjs/common';
import type { RequestUser } from '../../core/decorators/current-user.decorator';
import { DashboardsService } from '../dashboards/dashboards.service';
import type { QuerySpec } from '../query/dto/query-spec.dto';
import { QueryService } from '../query/query.service';
import { TokenService } from '../auth/token.service';
import { WidgetsService } from '../widgets/widgets.service';
import { buildCsv } from './csv';
import { DashboardPdfService } from './dashboard-pdf.service';

@Injectable()
export class ExportsService {
  constructor(
    private readonly widgets: WidgetsService,
    private readonly query: QueryService,
    private readonly dashboards: DashboardsService,
    private readonly tokenService: TokenService,
    private readonly dashboardPdf: DashboardPdfService,
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
      role: user.role,
      isPlatformAdmin: user.isPlatformAdmin,
    });
    return this.dashboardPdf.render(dashboardId, accessToken);
  }
}
