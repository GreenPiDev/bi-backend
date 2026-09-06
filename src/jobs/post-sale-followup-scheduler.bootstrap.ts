import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { Queue } from 'bullmq';
import {
  CHECK_POST_SALE_FOLLOWUP_JOB,
  POST_SALE_FOLLOWUP_CHECK_INTERVAL_MS,
  POST_SALE_FOLLOWUP_QUEUE,
  POST_SALE_FOLLOWUP_SCHEDULER_ID,
} from './post-sale-followup-queue.constants';

/** S2 icin tek, tum tenant'lari tarayan gunluk zamanlayici - ContactInactivitySchedulerBootstrap
 * ile ayni desen. */
@Injectable()
export class PostSaleFollowupSchedulerBootstrap implements OnModuleInit {
  constructor(
    @InjectQueue(POST_SALE_FOLLOWUP_QUEUE) private readonly queue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(
      POST_SALE_FOLLOWUP_SCHEDULER_ID,
      { every: POST_SALE_FOLLOWUP_CHECK_INTERVAL_MS },
      { name: CHECK_POST_SALE_FOLLOWUP_JOB },
    );
  }
}
