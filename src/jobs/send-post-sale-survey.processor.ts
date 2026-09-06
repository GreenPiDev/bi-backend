import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { MailService } from '../core/mail/mail.service';
import { PrismaService } from '../core/prisma/prisma.service';
import {
  POST_SALE_SURVEY_QUEUE,
  type SendPostSaleSurveyJobPayload,
} from './post-sale-survey-queue.constants';

/**
 * S3 (bkz. docs/VARSAYIMLAR.md V28): tek seferlik (cron degil) is - QuotesService
 * bir PostSaleCase'in contactId'si varsa bu job'i tetikler, POST /post-sale-cases/:id/
 * send-survey de ayni job'i tetikler (resend). Sadece e-posta gonderir, yanit
 * temsilci tarafindan elle isaretlenir - public/tokenli bir link/form yok.
 */
@Processor(POST_SALE_SURVEY_QUEUE)
export class SendPostSaleSurveyProcessor extends WorkerHost {
  private readonly logger = new Logger(SendPostSaleSurveyProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {
    super();
  }

  async process(job: Job<SendPostSaleSurveyJobPayload>): Promise<void> {
    const postSaleCase = await this.prisma.postSaleCase.findUnique({
      where: { id: job.data.postSaleCaseId },
      include: { quote: true, contact: true },
    });
    if (!postSaleCase || !postSaleCase.contact?.email) {
      this.logger.warn(
        `Anket gonderilemedi: PostSaleCase ${job.data.postSaleCaseId} icin kisi ya da e-posta adresi yok.`,
      );
      return;
    }

    await this.mail.send({
      to: [postSaleCase.contact.email],
      subject: `PiLens - Degerlendirme Anketi: ${postSaleCase.quote.quoteNumber}`,
      text: `Merhaba ${postSaleCase.contact.firstName} ${postSaleCase.contact.lastName}, ${postSaleCase.quote.quoteNumber} numarali teklifle ilgili hizmetimizden memnun kaldiniz mi? Geri bildiriminizi bizimle paylasmanizi rica ederiz.`,
    });

    const sentAt = new Date();
    await this.prisma.feedbackSurvey.upsert({
      where: { postSaleCaseId: postSaleCase.id },
      update: { sentAt },
      create: {
        tenantId: postSaleCase.tenantId,
        postSaleCaseId: postSaleCase.id,
        contactId: postSaleCase.contact.id,
        sentAt,
      },
    });
  }
}
