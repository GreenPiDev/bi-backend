import { Injectable, Logger } from '@nestjs/common';
import type { NotificationType, SupportTicketKind } from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import { RealtimeService } from '../../core/realtime/realtime.service';

const KIND_LABELS: Record<SupportTicketKind, string> = {
  PROBLEM: 'problem',
  SUGGESTION: 'öneri',
};

const BODY_PREVIEW_LENGTH = 200;

export interface NewTicketNotice {
  ticketId: string;
  tenantId: string;
  kind: SupportTicketKind;
  message: string;
  createdById: string;
}

/**
 * Yeni destek talebinde tum aktif super admin'lere zil bildirimi uretir. Super
 * admin'ler talebi acan tenant'ta degil, kendi tenant'larinda yasadigi icin
 * tenant-scoped client yerine ham PrismaService kullanilir (V7 deseni) ve bildirim
 * her admin'in kendi tenantId'siyle yazilir - boylece admin'in GET /notifications
 * sorgusu (kendi tenant'ina scope'lu) bu kaydi gorur. Bildirim hatasi talep
 * olusturmayi asla bozmaz.
 */
@Injectable()
export class SupportTicketNotifierService {
  private readonly logger = new Logger(SupportTicketNotifierService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  async notifyPlatformAdmins(notice: NewTicketNotice): Promise<void> {
    await this.notifyAdmins({
      ticketId: notice.ticketId,
      tenantId: notice.tenantId,
      createdById: notice.createdById,
      type: 'SUPPORT_TICKET_CREATED',
      title: (tenantName) =>
        `${tenantName} yeni bir ${KIND_LABELS[notice.kind]} bildirdi`,
      body: notice.message,
    });
  }

  /** Tenant kullanicisi mevcut bir talebin yazismasina yeni mesaj ekledi. */
  async notifyPlatformAdminsOfUserMessage(notice: {
    ticketId: string;
    tenantId: string;
    message: string;
    createdById: string;
  }): Promise<void> {
    await this.notifyAdmins({
      ticketId: notice.ticketId,
      tenantId: notice.tenantId,
      createdById: notice.createdById,
      type: 'SUPPORT_TICKET_USER_MESSAGE',
      title: (tenantName) => `${tenantName} destek talebine yeni mesaj yazdı`,
      body: notice.message,
    });
  }

  private async notifyAdmins(input: {
    ticketId: string;
    tenantId: string;
    createdById: string;
    type: Extract<
      NotificationType,
      'SUPPORT_TICKET_CREATED' | 'SUPPORT_TICKET_USER_MESSAGE'
    >;
    title: (tenantName: string) => string;
    body: string;
  }): Promise<void> {
    try {
      const [admins, tenant] = await Promise.all([
        this.prisma.user.findMany({
          where: { isPlatformAdmin: true, isActive: true },
          select: { id: true, tenantId: true },
        }),
        this.prisma.tenant.findUnique({
          where: { id: input.tenantId },
          select: { name: true },
        }),
      ]);
      if (admins.length === 0) return;

      const title = input.title(tenant?.name ?? 'Bir şirket');
      const body = input.body.slice(0, BODY_PREVIEW_LENGTH);
      await this.prisma.notification.createMany({
        data: admins.map((admin) => ({
          tenantId: admin.tenantId,
          recipientUserId: admin.id,
          type: input.type,
          title,
          body,
          relatedEntityType: 'SupportTicket',
          relatedEntityId: input.ticketId,
          createdById: input.createdById,
        })),
      });
      for (const admin of admins) {
        this.realtime.emitToTenant(
          admin.tenantId,
          'notifications.notification.created',
          { recipientUserId: admin.id },
        );
      }
    } catch (error) {
      this.logger.error(
        `Destek talebi bildirimi gonderilemedi (ticket=${input.ticketId})`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  /** Super admin yazismaya mesaj ekleyince talebi acan kullaniciya (kendi tenant'inda) bildirim. */
  async notifyTicketCreator(notice: {
    ticketId: string;
    tenantId: string;
    recipientUserId: string;
    reply: string;
    repliedById: string;
  }): Promise<void> {
    try {
      await this.prisma.notification.create({
        data: {
          tenantId: notice.tenantId,
          recipientUserId: notice.recipientUserId,
          type: 'SUPPORT_TICKET_REPLIED',
          title: 'Destek ekibinden yeni mesaj',
          body: notice.reply.slice(0, BODY_PREVIEW_LENGTH),
          relatedEntityType: 'SupportTicket',
          relatedEntityId: notice.ticketId,
          createdById: notice.repliedById,
        },
      });
      this.realtime.emitToTenant(
        notice.tenantId,
        'notifications.notification.created',
        { recipientUserId: notice.recipientUserId },
      );
    } catch (error) {
      this.logger.error(
        `Destek cevabi bildirimi gonderilemedi (ticket=${notice.ticketId})`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
