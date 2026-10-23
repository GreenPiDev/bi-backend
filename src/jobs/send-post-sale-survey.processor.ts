import { randomBytes } from 'node:crypto';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { MailService, type MailAttachment } from '../core/mail/mail.service';
import { PrismaService } from '../core/prisma/prisma.service';
import { R2StorageService } from '../core/storage/r2-storage.service';
import { PostSaleCasesCacheService } from '../modules/post-sale-cases/post-sale-cases-cache.service';
import {
  POST_SALE_SURVEY_QUEUE,
  type SendPostSaleSurveyJobPayload,
} from './post-sale-survey-queue.constants';

const LOGO_CID = 'tenant-logo';

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
    private readonly storage: R2StorageService,
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

    const tenantName = postSaleCase.tenant.name;
    const logoAttachment = await this.loadLogoAttachment(
      postSaleCase.tenant.logoKey,
    );

    await this.mail.send({
      to: [recipientEmail],
      subject: `${tenantName} Musteri Memnuniyeti Degerlendirme Anketi: ${referenceNumber}`,
      text: [
        `Sayin ${recipientName},`,
        '',
        `${tenantName} olarak sundugumuz hizmetleri surekli gelistirmek icin musterilerimizin gorus ve degerlendirmelerine onem veriyoruz.`,
        '',
        `${referenceNumber} numarali siparisinizle ilgili deneyiminizi bizimle paylasmanizdan memnuniyet duyariz.`,
        '',
        'Kisa degerlendirme anketimize asagidaki baglanti uzerinden ulasabilirsiniz:',
        link,
        '',
        'Vakit ayirdiginiz ve degerli gorusleriniz bizimle paylastiginiz icin tesekkur ederiz.',
        '',
        'Saygilarimizla,',
        tenantName,
      ].join('\n'),
      html: this.buildHtml(
        tenantName,
        recipientName,
        referenceNumber,
        link,
        Boolean(logoAttachment),
      ),
      attachments: logoAttachment ? [logoAttachment] : undefined,
      fromName: tenantName,
      replyTo: fromEmail ?? postSaleCase.tenant.email ?? undefined,
    });

    await this.postSaleCasesCache.invalidateForTenant(postSaleCase.tenantId);
  }

  /** Sirket logosu setliyse R2'den okuyup inline (cid) ek olarak hazirlar - mail
   * istemcileri dis URL'lere genelde guvenmedigi/engelledigi icin FileUrlService'in
   * uretecegi (ayrica auth gerektiren) proxy URL'i yerine gorsel dogrudan gomuluyor.
   * Logo yoksa veya R2 yapilandirilmamissa/okuma basarisiz olursa sessizce atlanir -
   * anket maili logosuz da gonderilebilir olmali. */
  private async loadLogoAttachment(
    logoKey: string | null,
  ): Promise<MailAttachment | null> {
    if (!logoKey) return null;
    try {
      const file = await this.storage.download(logoKey);
      const chunks: Buffer[] = [];
      for await (const chunk of file.body) {
        chunks.push(chunk as Buffer);
      }
      return {
        filename: 'logo',
        content: Buffer.concat(chunks),
        contentType: file.contentType ?? 'image/png',
        cid: LOGO_CID,
      };
    } catch (error) {
      this.logger.warn(
        `Sirket logosu mail'e eklenemedi (logoKey=${logoKey}): ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  private buildHtml(
    tenantName: string,
    recipientName: string,
    referenceNumber: string,
    link: string,
    hasLogo: boolean,
  ): string {
    const escapedTenantName = this.escapeHtml(tenantName);
    const escapedRecipientName = this.escapeHtml(recipientName);
    const escapedReferenceNumber = this.escapeHtml(referenceNumber);
    const logoHtml = hasLogo
      ? `<tr><td align="center" style="padding-top:32px;"><img src="cid:${LOGO_CID}" alt="${escapedTenantName}" style="max-height:48px;max-width:200px;" /></td></tr>`
      : '';

    return `<!doctype html>
<html lang="tr">
  <body style="margin:0;padding:0;background-color:#f4f5f7;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" style="max-width:560px;background-color:#ffffff;border-radius:8px;overflow:hidden;" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:40px 40px 24px 40px;color:#1f2328;font-size:15px;line-height:1.6;">
                <p style="margin:0 0 16px 0;">Sayın ${escapedRecipientName},</p>
                <p style="margin:0 0 16px 0;">${escapedTenantName} olarak sunduğumuz hizmetleri sürekli geliştirmek için müşterilerimizin görüş ve değerlendirmelerine önem veriyoruz.</p>
                <p style="margin:0 0 24px 0;">${escapedReferenceNumber} numaralı siparişinizle ilgili deneyiminizi bizimle paylaşmanızdan memnuniyet duyarız.</p>
                <p style="margin:0 0 24px 0;">Kısa değerlendirme anketimize aşağıdaki bağlantı üzerinden ulaşabilirsiniz:</p>
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td align="center" style="border-radius:6px;background-color:#4f46e5;">
                      <a href="${link}" style="display:inline-block;padding:12px 28px;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;border-radius:6px;">Anketi Değerlendir</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:32px 0 0 0;">Vakit ayırdığınız ve değerli görüşlerinizi bizimle paylaştığınız için teşekkür ederiz.</p>
                <p style="margin:24px 0 0 0;">Saygılarımızla,<br/>${escapedTenantName}</p>
              </td>
            </tr>
            ${logoHtml}
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
