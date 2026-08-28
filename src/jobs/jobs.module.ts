import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule } from '../modules/auth/auth.module';
import { DatasourcesModule } from '../modules/datasources/datasources.module';
import { ExportsModule } from '../modules/exports/exports.module';
import { QueryModule } from '../modules/query/query.module';
import { ALERTS_QUEUE } from './alerts-queue.constants';
import { AlertsSchedulerBootstrap } from './alerts-scheduler.bootstrap';
import { CheckAlertsProcessor } from './check-alerts.processor';
import { CheckContactInactivityProcessor } from './check-contact-inactivity.processor';
import { CONTACT_INACTIVITY_QUEUE } from './contact-inactivity-queue.constants';
import { ContactInactivitySchedulerBootstrap } from './contact-inactivity-scheduler.bootstrap';
import { IngestDatasourceProcessor } from './ingest-datasource.processor';
import { INGEST_QUEUE } from './ingest-queue.constants';
import { REPORTS_QUEUE } from './reports-queue.constants';
import { SendScheduledReportProcessor } from './send-scheduled-report.processor';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: { url: config.getOrThrow<string>('REDIS_URL') },
      }),
    }),
    BullModule.registerQueue({ name: INGEST_QUEUE }),
    BullModule.registerQueue({ name: REPORTS_QUEUE }),
    BullModule.registerQueue({ name: ALERTS_QUEUE }),
    BullModule.registerQueue({ name: CONTACT_INACTIVITY_QUEUE }),
    DatasourcesModule,
    AuthModule,
    ExportsModule,
    QueryModule,
  ],
  providers: [
    IngestDatasourceProcessor,
    SendScheduledReportProcessor,
    CheckAlertsProcessor,
    AlertsSchedulerBootstrap,
    CheckContactInactivityProcessor,
    ContactInactivitySchedulerBootstrap,
  ],
})
export class JobsModule {}
