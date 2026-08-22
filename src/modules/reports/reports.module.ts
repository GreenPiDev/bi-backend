import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { REPORTS_QUEUE } from '../../jobs/reports-queue.constants';
import { DashboardsModule } from '../dashboards/dashboards.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: REPORTS_QUEUE }),
    DashboardsModule,
  ],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
