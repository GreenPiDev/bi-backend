import { z } from 'zod';

export const CreateQuoteRejectionReasonOptionSchema = z.object({
  label: z.string().trim().min(1, 'Sebep adi gereklidir.').max(200),
});
export type CreateQuoteRejectionReasonOptionDto = z.infer<
  typeof CreateQuoteRejectionReasonOptionSchema
>;

export const UpdateQuoteRejectionReasonOptionSchema =
  CreateQuoteRejectionReasonOptionSchema;
export type UpdateQuoteRejectionReasonOptionDto = z.infer<
  typeof UpdateQuoteRejectionReasonOptionSchema
>;
