import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DashboardsModule } from '../dashboards/dashboards.module';
import { QueryModule } from '../query/query.module';
import { QuotesModule } from '../quotes/quotes.module';
import { SharesModule } from '../shares/shares.module';
import { TenantsModule } from '../tenants/tenants.module';
import { WidgetsModule } from '../widgets/widgets.module';
import { DashboardPdfService } from './dashboard-pdf.service';
import { ExportsController } from './exports.controller';
import { ExportsService } from './exports.service';
import { QuotePdfService } from './quote-pdf.service';
import { QuoteSharesController } from './quote-shares.controller';
import { ReportPdfService } from './report-pdf.service';

@Module({
  imports: [
    AuthModule,
    DashboardsModule,
    WidgetsModule,
    QueryModule,
    QuotesModule,
    SharesModule,
    TenantsModule,
  ],
  controllers: [ExportsController, QuoteSharesController],
  providers: [
    ExportsService,
    DashboardPdfService,
    QuotePdfService,
    ReportPdfService,
  ],
  exports: [DashboardPdfService],
})
export class ExportsModule {}
