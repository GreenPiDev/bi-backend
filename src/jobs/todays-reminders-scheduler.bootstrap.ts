import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { Queue } from 'bullmq';
import {
  CHECK_TODAYS_REMINDERS_JOB,
  TODAYS_REMINDERS_CHECK_INTERVAL_MS,
  TODAYS_REMINDERS_QUEUE,
  TODAYS_REMINDERS_SCHEDULER_ID,
} from './todays-reminders-queue.constants';

/** Ajanda'daki "bugun icin kurulmus hatirlaticilariniz var" bildirimi icin tek,
 * tum tenant'lari tarayan gunluk zamanlayici - InteractionReminder ile ayni desen. */
@Injectable()
export class TodaysRemindersSchedulerBootstrap implements OnModuleInit {
  constructor(
    @InjectQueue(TODAYS_REMINDERS_QUEUE) private readonly queue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(
      TODAYS_REMINDERS_SCHEDULER_ID,
      { every: TODAYS_REMINDERS_CHECK_INTERVAL_MS },
      { name: CHECK_TODAYS_REMINDERS_JOB },
    );
  }
}
