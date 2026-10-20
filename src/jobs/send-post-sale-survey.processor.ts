import { randomBytes } from 'node:crypto';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { MailService } from '../core/mail/mail.service';
import { PrismaService } from '../core/prisma/prisma.service';
import { PostSaleCasesCacheService } from '../modules/post-sale-cases/post-sale-cases-cache.service';
import {
  POST_SALE_SURVEY_QUEUE,
  type SendPostSaleSurveyJobPayload,
} from './post-sale-survey-queue.constants';

/**
 * S3 (bkz. docs/VARSAYIMLAR.md V28, 2026-10-20 revizyonu): tek seferlik (cron degil)
 * is - PostSaleCasesService.sendSurvey hangi Survey sablonunun ve aliciya (kisi veya
 * elle girilen mail) gonderilecegini zaten dogrulamis olarak buraya tasir. Bu job
 * sadece responseToken'i uretir (resend'de token YENIDEN uretilir - eski link gecersiz
 * olur), FeedbackSurvey'i upsert eder ve musteriye public yanit linkini iceren bir
 * e-posta gonderir. Gercek anket icerigi/sorulari e-postada DEGIL, linkteki /anket/:token
 * sayfasinda (bkz. modules/public-surveys, Faz 4).
 */
@Processor(POST_SALE_SURVEY_QUEUE)
export class SendPostSaleSurveyProcessor extends WorkerHost {
  private readonly logger = new Logger(SendPostSaleSurveyProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly postSaleCasesCache: PostSaleCasesCacheService,
    private readonly config: ConfigService,
  ) {
    super();
  }

  async process(job: Job<SendPostSaleSurveyJobPayload>): Promise<void> {
    const {
      postSaleCaseId,
      surveyId,
      recipientKind,
      contactId,
      recipientName,
      recipientEmail,
      fromEmail,
    } = job.data;

    const postSaleCase = await this.prisma.postSaleCase.findUnique({
      where: { id: postSaleCaseId },
      include: { salesOrder: true, quote: true, tenant: true },
    });
    if (!postSaleCase) {
      this.logger.warn(
        `Anket gonderilemedi: PostSaleCase ${postSaleCaseId} bulunamadi.`,
      );
      return;
    }

    const responseToken = randomBytes(32).toString('hex');
    const sentAt = new Date();

    await this.prisma.feedbackSurvey.upsert({
      where: { postSaleCaseId },
      update: {
        surveyId,
        recipientKind,
        contactId,
        recipientName,
        recipientEmail,
        responseToken,
        sentAt,
        respondedAt: null,
      },
      create: {
        tenantId: postSaleCase.tenantId,
        postSaleCaseId,
        surveyId,
        recipientKind,
        contactId,
        recipientName,
        recipientEmail,
        responseToken,
        sentAt,
      },
    });

    const referenceNumber =
      postSaleCase.quote?.quoteNumber ?? postSaleCase.salesOrder.orderNumber;
    const frontendUrl = this.config.getOrThrow<string>('FRONTEND_URL');
    const link = `${frontendUrl}/anket/${responseToken}`;

    await this.mail.send({
      to: [recipientEmail],
      subject: `PiLens - Degerlendirme Anketi: ${referenceNumber}`,
      text: `Merhaba ${recipientName}, ${referenceNumber} numarali siparisle ilgili degerlendirme anketimizi su linkten yanitlayabilirsiniz: ${link}`,
      fromName: postSaleCase.tenant.name,
      replyTo: fromEmail ?? postSaleCase.tenant.email ?? undefined,
    });

    await this.postSaleCasesCache.invalidateForTenant(postSaleCase.tenantId);
  }
}
