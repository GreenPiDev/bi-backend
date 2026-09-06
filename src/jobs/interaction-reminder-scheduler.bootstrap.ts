import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { Queue } from 'bullmq';
import {
  INTERACTION_REMINDER_CHECK_INTERVAL_MS,
  INTERACTION_REMINDER_QUEUE,
  INTERACTION_REMINDER_SCHEDULER_ID,
  SEND_INTERACTION_REMINDERS_JOB,
} from './interaction-reminder-queue.constants';

/** M4/M9 icin tek, tum tenant'lari tarayan gunluk zamanlayici - ContactInactivity
 * ile ayni desen (bkz. o dosyadaki not). */
@Injectable()
export class InteractionReminderSchedulerBootstrap implements OnModuleInit {
  constructor(
    @InjectQueue(INTERACTION_REMINDER_QUEUE) private readonly queue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(
      INTERACTION_REMINDER_SCHEDULER_ID,
      { every: INTERACTION_REMINDER_CHECK_INTERVAL_MS },
      { name: SEND_INTERACTION_REMINDERS_JOB },
    );
  }
}
