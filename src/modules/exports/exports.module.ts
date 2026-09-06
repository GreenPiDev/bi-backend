import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DashboardsModule } from '../dashboards/dashboards.module';
import { QueryModule } from '../query/query.module';
import { QuotesModule } from '../quotes/quotes.module';
import { WidgetsModule } from '../widgets/widgets.module';
import { DashboardPdfService } from './dashboard-pdf.service';
import { ExportsController } from './exports.controller';
import { ExportsService } from './exports.service';
import { QuotePdfService } from './quote-pdf.service';

@Module({
  imports: [
    AuthModule,
    DashboardsModule,
    WidgetsModule,
    QueryModule,
    QuotesModule,
  ],
  controllers: [ExportsController],
  providers: [ExportsService, DashboardPdfService, QuotePdfService],
  exports: [DashboardPdfService],
})
export class ExportsModule {}
