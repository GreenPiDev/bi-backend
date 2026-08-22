import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { INGEST_QUEUE } from '../../jobs/ingest-queue.constants';
import { DashboardsModule } from '../dashboards/dashboards.module';
import { DatasetsModule } from '../datasets/datasets.module';
import { WidgetsModule } from '../widgets/widgets.module';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: INGEST_QUEUE }),
    DatasetsModule,
    DashboardsModule,
    WidgetsModule,
  ],
  controllers: [OnboardingController],
  providers: [OnboardingService],
})
export class OnboardingModule {}
