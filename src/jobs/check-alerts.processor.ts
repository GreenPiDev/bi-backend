import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../core/prisma/prisma.service';
import { TenantContext } from '../core/tenant/tenant-context';
import { MailService } from '../core/mail/mail.service';
import type { AlertOperator } from '../modules/alerts/dto/alert.dto';
import type { QuerySpec } from '../modules/query/dto/query-spec.dto';
import { QueryService } from '../modules/query/query.service';
import { ALERT_COOLDOWN_MS, ALERTS_QUEUE } from './alerts-queue.constants';

const OPERATOR_LABELS: Record<AlertOperator, string> = {
  lt: 'küçüktür',
  lte: 'küçük eşittir',
  gt: 'büyüktür',
  gte: 'büyük eşittir',
};

export function isTriggered(
  value: number,
  operator: AlertOperator,
  threshold: number,
): boolean {
  switch (operator) {
    case 'lt':
      return value < threshold;
    case 'lte':
      return value <= threshold;
    case 'gt':
      return value > threshold;
    case 'gte':
      return value >= threshold;
  }
}

@Processor(ALERTS_QUEUE)
export class CheckAlertsProcessor extends WorkerHost {
  private readonly logger = new Logger(CheckAlertsProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly query: QueryService,
    private readonly mail: MailService,
  ) {
    super();
  }

  async process(): Promise<void> {
    const alerts = await this.prisma.alert.findMany({
      include: { widget: true },
    });

    for (const alert of alerts) {
      try {
        await this.checkOne(alert);
      } catch (err) {
        this.logger.warn(
          `Alarm ${alert.id} degerlendirilemedi: ${(err as Error).message}`,
        );
      }
    }
  }

  private async checkOne(
    alert: Awaited<ReturnType<PrismaService['alert']['findMany']>>[number] & {
      widget: { querySpec: unknown };
    },
  ): Promise<void> {
    if (
      alert.lastTriggeredAt &&
      Date.now() - alert.lastTriggeredAt.getTime() < ALERT_COOLDOWN_MS
    ) {
      return;
    }

    const querySpec = alert.widget.querySpec as unknown as QuerySpec;
    const result = await TenantContext.run(
      { tenantId: alert.tenantId, userId: 'system-alerts', role: 'OWNER' },
      () => this.query.runQuery(querySpec, alert.tenantId),
    );

    const value = Number(result.rows[0]?.[querySpec.dimensions.length]);
    if (Number.isNaN(value)) {
      return;
    }

    const operator = alert.operator as AlertOperator;
    if (!isTriggered(value, operator, alert.threshold)) {
      return;
    }

    await this.mail.send({
      to: alert.recipients,
      subject: `Pusula BI - Eşik alarmı tetiklendi`,
      text: `Değer (${value}) ${OPERATOR_LABELS[operator]} ${alert.threshold} oldu.`,
    });

    await this.prisma.alert.update({
      where: { id: alert.id },
      data: { lastTriggeredAt: new Date() },
    });
  }
}
