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
import { CheckPostSaleFollowupProcessor } from './check-post-sale-followup.processor';
import { CONTACT_INACTIVITY_QUEUE } from './contact-inactivity-queue.constants';
import { ContactInactivitySchedulerBootstrap } from './contact-inactivity-scheduler.bootstrap';
import { IngestDatasourceProcessor } from './ingest-datasource.processor';
import { INGEST_QUEUE } from './ingest-queue.constants';
import { INTERACTION_REMINDER_QUEUE } from './interaction-reminder-queue.constants';
import { InteractionReminderSchedulerBootstrap } from './interaction-reminder-scheduler.bootstrap';
import { POST_SALE_FOLLOWUP_QUEUE } from './post-sale-followup-queue.constants';
import { PostSaleFollowupSchedulerBootstrap } from './post-sale-followup-scheduler.bootstrap';
import { POST_SALE_SURVEY_QUEUE } from './post-sale-survey-queue.constants';
import { REPORTS_QUEUE } from './reports-queue.constants';
import { SendInteractionRemindersProcessor } from './send-interaction-reminders.processor';
import { SendPostSaleSurveyProcessor } from './send-post-sale-survey.processor';
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
    BullModule.registerQueue({ name: INTERACTION_REMINDER_QUEUE }),
    BullModule.registerQueue({ name: POST_SALE_FOLLOWUP_QUEUE }),
    BullModule.registerQueue({ name: POST_SALE_SURVEY_QUEUE }),
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
    SendInteractionRemindersProcessor,
    InteractionReminderSchedulerBootstrap,
    CheckPostSaleFollowupProcessor,
    PostSaleFollowupSchedulerBootstrap,
    SendPostSaleSurveyProcessor,
  ],
})
export class JobsModule {}
