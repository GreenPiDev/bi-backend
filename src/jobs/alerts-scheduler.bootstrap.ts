import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { Queue } from 'bullmq';
import {
  ALERT_CHECK_INTERVAL_MS,
  ALERTS_QUEUE,
  ALERTS_SCHEDULER_ID,
  CHECK_ALERTS_JOB,
} from './alerts-queue.constants';

/** Tum tenantlar icin tek bir periyodik "esik alarmlarini kontrol et" is'i kurar -
 * ScheduledReport'un aksine Alert'in kendi cron'u yok (CLAUDE.md F12 "basit esik
 * alarmi" diyor), bu yuzden tek bir sabit-araliklarli zamanlayici yeterli. */
@Injectable()
export class AlertsSchedulerBootstrap implements OnModuleInit {
  constructor(@InjectQueue(ALERTS_QUEUE) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(
      ALERTS_SCHEDULER_ID,
      { every: ALERT_CHECK_INTERVAL_MS },
      { name: CHECK_ALERTS_JOB },
    );
  }
}
