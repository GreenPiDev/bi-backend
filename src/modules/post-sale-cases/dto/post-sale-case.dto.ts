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

export const PostSaleCaseQuerySchema = ListQuerySchema.extend({
  accountId: z.string().uuid().optional(),
  status: PostSaleCaseStatusSchema.optional(),
});
export type PostSaleCaseQueryDto = z.infer<typeof PostSaleCaseQuerySchema>;

/** S3: case'de contactId zaten varsa gonderilmeyebilir (resend), yoksa zorunludur -
 * bu kural DTO'da degil serviste kontrol edilir. */
export const SendPostSaleSurveySchema = z.object({
  contactId: z.string().uuid().optional(),
});
export type SendPostSaleSurveyDto = z.infer<typeof SendPostSaleSurveySchema>;

export const MarkPostSaleFeedbackSchema = z.object({
  responseNote: z.string().trim().min(1).max(2000).optional(),
});
export type MarkPostSaleFeedbackDto = z.infer<
  typeof MarkPostSaleFeedbackSchema
>;
