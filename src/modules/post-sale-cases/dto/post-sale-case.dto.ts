import { z } from 'zod';
import { ListQuerySchema } from '../../../core/dto/list-query.dto';

/** Hesaplanan alan (DB'de tutulmaz) - Account.missingCriticalFields ile ayni
 * konvansiyon (bkz. docs/VARSAYIMLAR.md V18/V28). */
export const PostSaleCaseStatusSchema = z.enum([
  'BEKLEMEDE',
  'HATIRLATILDI',
  'GERI_BILDIRIM_ALINDI',
]);
export type PostSaleCaseStatus = z.infer<typeof PostSaleCaseStatusSchema>;

/** `q` (ListQuerySchema'dan miras) - serbest metin arama: teklif no, firma adi,
 * kisi adi/soyadi (bkz. PostSaleCasesService.list). */
export const PostSaleCaseQuerySchema = ListQuerySchema.extend({
  accountId: z.string().uuid().optional(),
  status: PostSaleCaseStatusSchema.optional(),
  /** Olusma tarihi (createdAt) filtresi (liste sayfasi filtre penceresi) - hem tek
   * tarih ("su tarihten itibaren") hem aralik ("iki tarih arasi") secimi frontend'de
   * bu ayni from/to ciftine cevrilir - bkz. quote.dto.ts'teki ayni desen. */
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type PostSaleCaseQueryDto = z.infer<typeof PostSaleCaseQuerySchema>;

/** S3 (2026-10-20 revizyonu, bkz. docs/VARSAYIMLAR.md): artik hangi Survey sablonunun
 * gonderilecegi + aliciyi (CONTACT: firmanin bir kontagi, email duzenlenebilir / EMAIL:
 * elle girilen ad+mail) her gonderimde aciklamak gerekiyor - eski "case'de contactId
 * varsa resend" kisayolu kalkti, her gonderim recipientName/recipientEmail'i acikca tasir. */
export const SendPostSaleSurveySchema = z
  .object({
    surveyId: z.string().uuid(),
    recipientKind: z.enum(['CONTACT', 'EMAIL']),
    contactId: z.string().uuid().optional(),
    recipientName: z
      .string()
      .trim()
      .min(1, 'Alici adi bos birakilamaz.')
      .max(200),
    recipientEmail: z
      .string()
      .trim()
      .email('Gecerli bir e-posta adresi giriniz.'),
    /** Kullanici talebi (2026-10-20): varsayilan olarak Tenant.email gelir ama
     * /satis-sonrasi/:id ekraninda gonderim bazinda override edilebilir - bkz.
     * send-post-sale-survey.processor.ts (MailService.replyTo). */
    fromEmail: z
      .string()
      .trim()
      .email('Gecerli bir e-posta adresi giriniz.')
      .optional(),
  })
  .refine((dto) => dto.recipientKind !== 'CONTACT' || Boolean(dto.contactId), {
    message: 'Kisi secilmelidir.',
    path: ['contactId'],
  });
export type SendPostSaleSurveyDto = z.infer<typeof SendPostSaleSurveySchema>;

export const MarkPostSaleFeedbackSchema = z.object({
  responseNote: z.string().trim().min(1).max(2000).optional(),
});
export type MarkPostSaleFeedbackDto = z.infer<
  typeof MarkPostSaleFeedbackSchema
>;
