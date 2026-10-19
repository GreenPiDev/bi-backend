import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../core/prisma/prisma.service';
import { MailService } from '../core/mail/mail.service';
import { PostSaleCasesCacheService } from '../modules/post-sale-cases/post-sale-cases-cache.service';
import { POST_SALE_FOLLOWUP_QUEUE } from './post-sale-followup-queue.constants';

/**
 * S2 (bkz. docs/VARSAYIMLAR.md V28, revize V68): reminderAt (case olusturulurken
 * tenant'in postSaleFollowUpDays ayariyla onceden hesaplandi) gecmis ve henuz
 * hatirlatilmamis PostSaleCase kayitlarini tarar, ilgili satis siparisini olusturan
 * satis temsilcisine (SalesOrder.createdById) hatirlatma e-postasi gonderir.
 * quoteId artik nullable (teklifsiz manuel SalesOrder'lar) - teklif numarasi varsa
 * e-postada ek bilgi olarak gosterilir, yoksa sadece siparis numarasi kullanilir.
 * reminderSentAt idempotency guard'i - send-interaction-reminders ile ayni desen.
 */
@Processor(POST_SALE_FOLLOWUP_QUEUE)
export class CheckPostSaleFollowupProcessor extends WorkerHost {
  private readonly logger = new Logger(CheckPostSaleFollowupProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly postSaleCasesCache: PostSaleCasesCacheService,
  ) {
    super();
  }

  async process(): Promise<void> {
    const dueCases = await this.prisma.postSaleCase.findMany({
      where: { reminderSentAt: null, reminderAt: { lte: new Date() } },
    });

    for (const postSaleCase of dueCases) {
      try {
        await this.notify(
          postSaleCase.id,
          postSaleCase.salesOrderId,
          postSaleCase.tenantId,
        );
      } catch (err) {
        this.logger.warn(
          `Satis sonrasi hatirlatma gonderilemedi (case ${postSaleCase.id}): ${(err as Error).message}`,
        );
      }
    }
  }

  private async notify(
    postSaleCaseId: string,
    salesOrderId: string,
    tenantId: string,
  ): Promise<void> {
    const salesOrder = await this.prisma.salesOrder.findUnique({
      where: { id: salesOrderId },
      include: { quote: true },
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

    const referenceLabel = salesOrder.quote
      ? `${salesOrder.orderNumber} (teklif ${salesOrder.quote.quoteNumber})`
      : salesOrder.orderNumber;

    await this.mail.send({
      to: [salesRep.email],
      subject: `PiLens - Satis Sonrasi Kontrol: ${salesOrder.orderNumber}`,
      text: `${referenceLabel} numarali satis siparisi olustu. Musteri memnun mu, geri bildirim var mi kontrol ediniz.`,
    });

    await this.prisma.postSaleCase.update({
      where: { id: postSaleCaseId },
      data: { reminderSentAt: new Date() },
    });
    await this.postSaleCasesCache.invalidateForTenant(tenantId);
  }
}
