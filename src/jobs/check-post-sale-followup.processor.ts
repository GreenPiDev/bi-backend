import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../core/prisma/prisma.service';
import { RealtimeService } from '../core/realtime/realtime.service';
import { PostSaleCasesCacheService } from '../modules/post-sale-cases/post-sale-cases-cache.service';
import { POST_SALE_FOLLOWUP_QUEUE } from './post-sale-followup-queue.constants';

/**
 * S2 (bkz. docs/VARSAYIMLAR.md V28, revize V68, 2026-10-20'de ikinci revizyon):
 * reminderAt (case olusturulurken tenant'in postSaleFollowUpDays ayariyla onceden
 * hesaplandi) gecmis ve henuz hatirlatilmamis PostSaleCase kayitlarini tarar. Eskiden
 * satis temsilcisine "musteri memnun mu kontrol et" diye MAIL gidiyordu - kullanici
 * talebiyle bunun yerine in-app Notification'a gecildi ("X sirketine anket gonderilmesi
 * gerekiyor"), check-contact-inactivity.processor.ts ile ayni ham-Prisma + manuel
 * emitToTenant deseni (bu is tum tenant'lari tek cron'da tarar, TenantContext kurulu
 * degil). Zamanlama ayari (crm.postSaleFollowUpDays, varsayilan 14) degismedi.
 */
@Processor(POST_SALE_FOLLOWUP_QUEUE)
export class CheckPostSaleFollowupProcessor extends WorkerHost {
  private readonly logger = new Logger(CheckPostSaleFollowupProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly postSaleCasesCache: PostSaleCasesCacheService,
  ) {
    super();
  }

  async process(): Promise<void> {
    const dueCases = await this.prisma.postSaleCase.findMany({
      where: { reminderSentAt: null, reminderAt: { lte: new Date() } },
      include: { account: true, quote: { select: { quoteNumber: true } } },
    });

    for (const postSaleCase of dueCases) {
      try {
        await this.notify(postSaleCase);
      } catch (err) {
        this.logger.warn(
          `Satis sonrasi hatirlatma gonderilemedi (case ${postSaleCase.id}): ${(err as Error).message}`,
        );
      }
    }
  }

  private async notify(postSaleCase: {
    id: string;
    salesOrderId: string;
    tenantId: string;
    account: { name: string };
    quote?: { quoteNumber: string } | null;
  }): Promise<void> {
    const salesOrder = await this.prisma.salesOrder.findUnique({
      where: { id: postSaleCase.salesOrderId },
    });
    if (!salesOrder) {
      return;
    }
    const salesRep = await this.prisma.user.findUnique({
      where: { id: salesOrder.createdById },
    });
    if (!salesRep || !salesRep.isActive) {
      return;
    }

    // Ayni firmanin birden fazla teklifi icin gelen bildirimler birbirinden ayirt
    // edilebilsin diye teklif no (teklifsiz/manuel siparislerde siparis no) eklenir.
    const reference = postSaleCase.quote?.quoteNumber ?? salesOrder.orderNumber;

    await this.prisma.notification.create({
      data: {
        tenantId: postSaleCase.tenantId,
        recipientUserId: salesRep.id,
        type: 'POST_SALE_SURVEY_REMINDER',
        title: `${postSaleCase.account.name} şirketine anket gönderilmesi gerekiyor. (${reference})`,
        relatedEntityType: 'PostSaleCase',
        relatedEntityId: postSaleCase.id,
      },
    });
    this.realtime.emitToTenant(
      postSaleCase.tenantId,
      'notifications.notification.created',
      { recipientUserId: salesRep.id },
    );

    await this.prisma.postSaleCase.update({
      where: { id: postSaleCase.id },
      data: { reminderSentAt: new Date() },
    });
    await this.postSaleCasesCache.invalidateForTenant(postSaleCase.tenantId);
  }
}
