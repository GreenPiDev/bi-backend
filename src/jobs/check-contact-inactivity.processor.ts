import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Contact } from '@prisma/client';
import { PrismaService } from '../core/prisma/prisma.service';
import { RealtimeService } from '../core/realtime/realtime.service';
import {
  CONTACT_INACTIVITY_THRESHOLD_DAYS_KEY,
  DEFAULT_CONTACT_INACTIVITY_THRESHOLD_DAYS,
} from '../modules/tenant-settings/tenant-settings.constants';
import { CONTACT_INACTIVITY_QUEUE } from './contact-inactivity-queue.constants';

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

@Processor(CONTACT_INACTIVITY_QUEUE)
export class CheckContactInactivityProcessor extends WorkerHost {
  private readonly logger = new Logger(CheckContactInactivityProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {
    super();
  }

  async process(): Promise<void> {
    const tenantIds = await this.prisma.contact.findMany({
      where: { status: 'ACTIVE', deletedAt: null },
      distinct: ['tenantId'],
      select: { tenantId: true },
    });

    for (const { tenantId } of tenantIds) {
      try {
        await this.checkTenant(tenantId);
      } catch (err) {
        this.logger.warn(
          `Tenant ${tenantId} icin inaktivite kontrolu basarisiz: ${(err as Error).message}`,
        );
      }
    }
  }

  private async getThresholdDays(tenantId: string): Promise<number> {
    const setting = await this.prisma.tenantSetting.findFirst({
      where: { tenantId, key: CONTACT_INACTIVITY_THRESHOLD_DAYS_KEY },
    });
    return typeof setting?.value === 'number'
      ? setting.value
      : DEFAULT_CONTACT_INACTIVITY_THRESHOLD_DAYS;
  }

  private async checkTenant(tenantId: string): Promise<void> {
    const thresholdDays = await this.getThresholdDays(tenantId);
    const cutoff = daysAgo(thresholdDays);

    const staleContacts = await this.prisma.contact.findMany({
      where: {
        tenantId,
        status: 'ACTIVE',
        deletedAt: null,
        OR: [
          { lastContactedAt: { lt: cutoff } },
          { lastContactedAt: null, createdAt: { lt: cutoff } },
        ],
      },
    });

    for (const contact of staleContacts) {
      const effectiveLastContact = contact.lastContactedAt ?? contact.createdAt;
      const alreadyNotified =
        contact.inactivityNotifiedAt &&
        contact.inactivityNotifiedAt >= effectiveLastContact;
      if (alreadyNotified) {
        continue;
      }
      await this.notify(tenantId, contact, thresholdDays);
    }
  }

  private async notify(
    tenantId: string,
    contact: Contact,
    thresholdDays: number,
  ): Promise<void> {
    const recipients = await this.prisma.user.findMany({
      where: { tenantId, isActive: true },
      select: { id: true },
    });

    const title = `${contact.firstName} ${contact.lastName} ile ${thresholdDays} gündür iletişim kurulmadı.`;

    await Promise.all(
      recipients.map(async (user) => {
        await this.prisma.notification.create({
          data: {
            tenantId,
            recipientUserId: user.id,
            type: 'CONTACT_INACTIVITY_ALERT',
            title,
            relatedEntityType: 'Contact',
            relatedEntityId: contact.id,
          },
        });
        this.realtime.emitToTenant(
          tenantId,
          'notifications.notification.created',
          {
            recipientUserId: user.id,
          },
        );
      }),
    );

    await this.prisma.contact.update({
      where: { id: contact.id },
      data: { inactivityNotifiedAt: new Date() },
    });
  }
}
