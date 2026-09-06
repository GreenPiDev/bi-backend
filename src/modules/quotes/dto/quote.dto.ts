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
  /** Q3: verilmezse fiyat listesinden alinir; verilirse manuel ezme sayilir. */
  unitPrice: z.number().nonnegative().optional(),
  discountPct: z.number().min(0).max(100).default(0),
  vatPct: z.number().min(0).max(100).default(0),
});

/** O2: teklif olustururken isaretlenirse otomatik firsat olusturulur. */
const QuoteOpportunityInputSchema = z.object({
  name: z.string().trim().min(2, 'Firsat adi en az 2 karakter olmalidir.'),
  stage: OpportunityStageSchema.optional(),
  estimatedValue: z.number().nonnegative().optional(),
});

export const CreateQuoteSchema = z.object({
  accountId: z.string().uuid(),
  priceListId: z.string().uuid(),
  items: z
    .array(QuoteItemInputSchema)
    .min(1, 'En az bir urun satiri eklenmelidir.')
    .max(200),
  opportunity: QuoteOpportunityInputSchema.optional(),
});
export type CreateQuoteDto = z.infer<typeof CreateQuoteSchema>;
export type QuoteItemInputDto = z.infer<typeof QuoteItemInputSchema>;

export const UpdateQuoteSchema = z.object({
  priceListId: z.string().uuid().optional(),
  items: z.array(QuoteItemInputSchema).min(1).max(200).optional(),
});
export type UpdateQuoteDto = z.infer<typeof UpdateQuoteSchema>;

export const QuoteQuerySchema = ListQuerySchema.extend({
  accountId: z.string().uuid().optional(),
  status: QuoteStatusSchema.optional(),
});
export type QuoteQueryDto = z.infer<typeof QuoteQuerySchema>;
