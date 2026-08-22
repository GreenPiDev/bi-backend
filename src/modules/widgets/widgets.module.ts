import { Module } from '@nestjs/common';
import { DashboardsModule } from '../dashboards/dashboards.module';
import { WidgetsController } from './widgets.controller';
import { WidgetsService } from './widgets.service';

@Module({
  imports: [DashboardsModule],
  controllers: [WidgetsController],
  providers: [WidgetsService],
})
export class WidgetsModule {}
