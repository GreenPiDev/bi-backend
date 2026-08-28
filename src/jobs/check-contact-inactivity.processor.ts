import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Contact } from '@prisma/client';
import { PrismaService } from '../core/prisma/prisma.service';
import { MailService } from '../core/mail/mail.service';
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
    private readonly mail: MailService,
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

  private async recipientsFor(
    tenantId: string,
    contact: Contact,
  ): Promise<string[]> {
    if (contact.ownerId) {
      const owner = await this.prisma.user.findFirst({
        where: { id: contact.ownerId, tenantId, isActive: true },
      });
      if (owner) {
        return [owner.email];
      }
    }
    const admins = await this.prisma.user.findMany({
      where: {
        tenantId,
        isActive: true,
        roles: { some: { role: { isCompanyAdmin: true } } },
      },
    });
    return admins.map((admin) => admin.email);
  }

  private async notify(
    tenantId: string,
    contact: Contact,
    thresholdDays: number,
  ): Promise<void> {
    const recipients = await this.recipientsFor(tenantId, contact);
    if (recipients.length === 0) {
      return;
    }

    await this.mail.send({
      to: recipients,
      subject: 'PiLens - Uzun suredir iletisim kurulmayan kisi',
      text: `${contact.firstName} ${contact.lastName} ile ${thresholdDays} gundur iletisim kurulmadi.`,
    });

    await this.prisma.contact.update({
      where: { id: contact.id },
      data: { inactivityNotifiedAt: new Date() },
    });
  }
}
