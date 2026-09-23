import { z } from 'zod';
import { ListQuerySchema } from '../../../core/dto/list-query.dto';
import { OpportunityStageSchema } from '../../opportunities/dto/opportunity.dto';

export const QuoteStatusSchema = z.enum([
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'REJECTED',
]);

const QuoteItemInputSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().positive(),
  /** Q3: verilmezse Product.price'tan alinir; verilirse manuel ezme sayilir.
   * QuoteItem.unitPrice @db.Decimal(14, 2) - DB'nin kabul edebilecegi ust sinir. */
  unitPrice: z
    .number()
    .nonnegative()
    .max(999_999_999_999.99, 'Birim fiyat cok buyuk.')
    .optional(),
  discountPct: z.number().min(0).max(100).default(0),
  vatPct: z.number().min(0).max(100).default(0),
});

/** O2: teklif olustururken isaretlenirse otomatik firsat olusturulur. */
const QuoteOpportunityInputSchema = z.object({
  name: z.string().trim().min(2, 'Firsat adi en az 2 karakter olmalidir.'),
  stage: OpportunityStageSchema.optional(),
  // Opportunity.estimatedValue @db.Decimal(14, 2) - DB'nin kabul edebilecegi ust sinir.
  estimatedValue: z
    .number()
    .nonnegative()
    .max(999_999_999_999.99, 'Tahmini deger cok buyuk.')
    .optional(),
});

export const CreateQuoteSchema = z.object({
  accountId: z.string().uuid(),
  /** S3'un muhatap kisisi (bkz. docs/VARSAYIMLAR.md V28) - opsiyonel, verilirse
   * accountId'ye ait bir kisi olmalidir. */
  contactId: z.string().uuid().optional(),
  items: z
    .array(QuoteItemInputSchema)
    .min(1, 'En az bir urun satiri eklenmelidir.')
    .max(200),
  opportunity: QuoteOpportunityInputSchema.optional(),
});
export type CreateQuoteDto = z.infer<typeof CreateQuoteSchema>;
export type QuoteItemInputDto = z.infer<typeof QuoteItemInputSchema>;

export const UpdateQuoteSchema = z.object({
  items: z.array(QuoteItemInputSchema).min(1).max(200).optional(),
  /** /teklifler listesindeki durum dropdown'undan gelen dogrudan durum degisikligi. */
  status: QuoteStatusSchema.optional(),
});
export type UpdateQuoteDto = z.infer<typeof UpdateQuoteSchema>;

export const QuoteQuerySchema = ListQuerySchema.extend({
  accountId: z.string().uuid().optional(),
  status: QuoteStatusSchema.optional(),
});
export type QuoteQueryDto = z.infer<typeof QuoteQuerySchema>;
