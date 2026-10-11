import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { Queue } from 'bullmq';
import {
  APPLY_STOCK_HOLDING_COST_JOB,
  STOCK_HOLDING_COST_CRON_PATTERN,
  STOCK_HOLDING_COST_QUEUE,
  STOCK_HOLDING_COST_SCHEDULER_ID,
  STOCK_HOLDING_COST_TZ,
} from './stock-holding-cost-queue.constants';

/** Diger scheduler bootstrap'lerden (PostSaleFollowup, ContactInactivity vb.)
 * farkli olarak sabit bir aralik degil, sabit bir saat (00:30 Europe/Istanbul)
 * ister - bu yuzden `every` yerine cron `pattern` + `tz` kullanilir. */
@Injectable()
export class StockHoldingCostSchedulerBootstrap implements OnModuleInit {
  constructor(
    @InjectQueue(STOCK_HOLDING_COST_QUEUE) private readonly queue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(
      STOCK_HOLDING_COST_SCHEDULER_ID,
      { pattern: STOCK_HOLDING_COST_CRON_PATTERN, tz: STOCK_HOLDING_COST_TZ },
      { name: APPLY_STOCK_HOLDING_COST_JOB },
    );
  }
}
