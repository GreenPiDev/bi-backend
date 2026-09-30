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
  companyPhone: z.string().trim().max(50).optional(),
  companyEmail: z
    .string()
    .trim()
    .email('Gecerli bir e-posta girin.')
    .optional(),
  /** Coklu ofis adresi - her satir bir adres (bkz. docs/VARSAYIMLAR.md V41). */
  companyAddressLines: z.array(z.string().trim().max(300)).max(10).default([]),
  senderName: z.string().trim().max(200).optional(),
  senderTitle: z.string().trim().max(200).optional(),
  senderPhone: z.string().trim().max(50).optional(),
  senderEmail: z.string().trim().email('Gecerli bir e-posta girin.').optional(),
});
export type CreateQuoteTemplateDto = z.infer<typeof CreateQuoteTemplateSchema>;

export const UpdateQuoteTemplateSchema = z.object({
  name: z.string().trim().min(2).optional(),
  isDefault: z.boolean().optional(),
  companyDisplayName: z.string().trim().min(2).optional(),
  companyTagline: z.string().trim().max(400).nullable().optional(),
  companyPhone: z.string().trim().max(50).nullable().optional(),
  companyEmail: z
    .string()
    .trim()
    .email('Gecerli bir e-posta girin.')
    .nullable()
    .optional(),
  companyAddressLines: z.array(z.string().trim().max(300)).max(10).optional(),
  senderName: z.string().trim().max(200).nullable().optional(),
  senderTitle: z.string().trim().max(200).nullable().optional(),
  senderPhone: z.string().trim().max(50).nullable().optional(),
  senderEmail: z
    .string()
    .trim()
    .email('Gecerli bir e-posta girin.')
    .nullable()
    .optional(),
});
export type UpdateQuoteTemplateDto = z.infer<typeof UpdateQuoteTemplateSchema>;

export const QuoteTemplateQuerySchema = ListQuerySchema;
export type QuoteTemplateQueryDto = z.infer<typeof QuoteTemplateQuerySchema>;
