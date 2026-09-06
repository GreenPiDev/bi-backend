import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../core/prisma/prisma.service';
import { MailService } from '../core/mail/mail.service';
import { POST_SALE_FOLLOWUP_QUEUE } from './post-sale-followup-queue.constants';

/**
 * S2 (bkz. docs/VARSAYIMLAR.md V28): reminderAt (case olusturulurken tenant'in
 * postSaleFollowUpDays ayariyla onceden hesaplandi) gecmis ve henuz hatirlatilmamis
 * PostSaleCase kayitlarini tarar, ilgili teklifi olusturan satis temsilcisine
 * (Quote.createdById) hatirlatma e-postasi gonderir. reminderSentAt idempotency
 * guard'i - send-interaction-reminders ile ayni desen.
 */
@Processor(POST_SALE_FOLLOWUP_QUEUE)
export class CheckPostSaleFollowupProcessor extends WorkerHost {
  private readonly logger = new Logger(CheckPostSaleFollowupProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {
    super();
  }

  async process(): Promise<void> {
    const dueCases = await this.prisma.postSaleCase.findMany({
      where: { reminderSentAt: null, reminderAt: { lte: new Date() } },
    });

    for (const postSaleCase of dueCases) {
      try {
        await this.notify(postSaleCase.id, postSaleCase.quoteId);
      } catch (err) {
        this.logger.warn(
          `Satis sonrasi hatirlatma gonderilemedi (case ${postSaleCase.id}): ${(err as Error).message}`,
        );
      }
    }
  }

  private async notify(postSaleCaseId: string, quoteId: string): Promise<void> {
    const quote = await this.prisma.quote.findUnique({
      where: { id: quoteId },
    });
    if (!quote) {
      return;
    }
    const salesRep = await this.prisma.user.findUnique({
      where: { id: quote.createdById },
    });
    if (!salesRep || !salesRep.isActive) {
      return;
    }

    await this.mail.send({
      to: [salesRep.email],
      subject: `PiLens - Satis Sonrasi Kontrol: ${quote.quoteNumber}`,
      text: `${quote.quoteNumber} numarali teklif onaylandi. Musteri memnun mu, geri bildirim var mi kontrol ediniz.`,
    });

    await this.prisma.postSaleCase.update({
      where: { id: postSaleCaseId },
      data: { reminderSentAt: new Date() },
    });
  }
}
