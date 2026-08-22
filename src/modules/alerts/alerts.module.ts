import { Module } from '@nestjs/common';
import { WidgetsModule } from '../widgets/widgets.module';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';

@Module({
  imports: [WidgetsModule],
  controllers: [AlertsController],
  providers: [AlertsService],
})
export class AlertsModule {}
