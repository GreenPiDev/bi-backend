import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { Queue } from 'bullmq';
import {
  CHECK_CONTACT_INACTIVITY_JOB,
  CONTACT_INACTIVITY_CHECK_INTERVAL_MS,
  CONTACT_INACTIVITY_QUEUE,
  CONTACT_INACTIVITY_SCHEDULER_ID,
} from './contact-inactivity-queue.constants';

/** K2 icin tek, tum tenant'lari tarayan gunluk zamanlayici - AlertsSchedulerBootstrap
 * ile ayni desen (bkz. o dosyadaki not). */
@Injectable()
export class ContactInactivitySchedulerBootstrap implements OnModuleInit {
  constructor(
    @InjectQueue(CONTACT_INACTIVITY_QUEUE) private readonly queue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(
      CONTACT_INACTIVITY_SCHEDULER_ID,
      { every: CONTACT_INACTIVITY_CHECK_INTERVAL_MS },
      { name: CHECK_CONTACT_INACTIVITY_JOB },
    );
  }
}
