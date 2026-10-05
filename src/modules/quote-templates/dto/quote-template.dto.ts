import { z } from 'zod';
import { ListQuerySchema } from '../../../core/dto/list-query.dto';

export const CreateQuoteTemplateSchema = z.object({
  name: z.string().trim().min(2, 'Sablon adi en az 2 karakter olmalidir.'),
  isDefault: z.boolean().optional(),
  companyDisplayName: z
    .string()
    .trim()
    .min(2, 'Sirket adi en az 2 karakter olmalidir.'),
  companyTagline: z.string().trim().max(400).optional(),
});
export type CreateQuoteTemplateDto = z.infer<typeof CreateQuoteTemplateSchema>;

export const UpdateQuoteTemplateSchema = z.object({
  name: z.string().trim().min(2).optional(),
  isDefault: z.boolean().optional(),
  companyDisplayName: z.string().trim().min(2).optional(),
  companyTagline: z.string().trim().max(400).nullable().optional(),
});
export type UpdateQuoteTemplateDto = z.infer<typeof UpdateQuoteTemplateSchema>;

export const QuoteTemplateQuerySchema = ListQuerySchema;
export type QuoteTemplateQueryDto = z.infer<typeof QuoteTemplateQuerySchema>;
