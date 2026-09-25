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
  /** Kullanicinin elle girdigi teklif tarihi - quoteNumber'in gun-icinde-sayaci
   * icin kullandigi sistem tarihinden bagimsizdir. */
  quoteDate: z.coerce.date(),
  /** Serbest metin, orn. "3 is gunu", "2 hafta", "2-3 hafta". */
  leadTime: z.string().trim().max(200).optional(),
  /** Tenant'in tanimladigi listeye karsi dogrulanir, bkz. QuotesService.assertValidPaymentMethod. */
  paymentMethod: z.string().trim().max(200).optional(),
  title: z.string().trim().max(200).optional(),
  salesTerms: z.string().trim().max(4000).optional(),
  deliveryTerms: z.string().trim().max(4000).optional(),
  /** Tenant'in crm_iban_options listesinden secilir, 4 alani teklife kopyalanir
   * (bkz. QuotesService.resolveIbanSnapshot). */
  ibanOptionId: z.string().uuid().optional(),
});
export type CreateQuoteDto = z.infer<typeof CreateQuoteSchema>;
export type QuoteItemInputDto = z.infer<typeof QuoteItemInputSchema>;

export const UpdateQuoteSchema = z.object({
  items: z.array(QuoteItemInputSchema).min(1).max(200).optional(),
  /** /teklifler listesindeki durum dropdown'undan gelen dogrudan durum degisikligi. */
  status: QuoteStatusSchema.optional(),
  /** null verilirse muhatap kisi kaldirilir, alan hic verilmezse mevcut deger korunur. */
  contactId: z.string().uuid().nullable().optional(),
  quoteDate: z.coerce.date().optional(),
  /** null verilirse alan temizlenir, hic verilmezse mevcut deger korunur. */
  leadTime: z.string().trim().max(200).nullable().optional(),
  paymentMethod: z.string().trim().max(200).nullable().optional(),
  title: z.string().trim().max(200).nullable().optional(),
  salesTerms: z.string().trim().max(4000).nullable().optional(),
  deliveryTerms: z.string().trim().max(4000).nullable().optional(),
  /** null verilirse IBAN snapshot'i temizlenir, hic verilmezse mevcut deger korunur. */
  ibanOptionId: z.string().uuid().nullable().optional(),
});
export type UpdateQuoteDto = z.infer<typeof UpdateQuoteSchema>;

export const QuoteQuerySchema = ListQuerySchema.extend({
  accountId: z.string().uuid().optional(),
  status: QuoteStatusSchema.optional(),
});
export type QuoteQueryDto = z.infer<typeof QuoteQuerySchema>;
