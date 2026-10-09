import { z } from 'zod';
import { ListQuerySchema } from '../../../core/dto/list-query.dto';
import {
  CurrencyCodeSchema,
  OpportunityStageSchema,
} from '../../opportunities/dto/opportunity.dto';

/** Q3/A1-genislemesi: teklifin tek bir genel toplamini gosterebilmek icin secilen
 * hedef para birimi ve kalem para birimlerinden bu hedefe cevrim kuru snapshot'i
 * (bkz. Quote.exchangeRates doc comment'i). */
export const QuoteExchangeRatesSchema = z.object({
  asOf: z.string().max(20).optional(),
  rates: z.partialRecord(CurrencyCodeSchema, z.number().positive()),
});
export type QuoteExchangeRatesDto = z.infer<typeof QuoteExchangeRatesSchema>;

export const FxRatesQuerySchema = z.object({
  base: CurrencyCodeSchema,
  /** Virgulle ayrilmis para birimi listesi, orn. "USD,EUR". */
  targets: z.string().max(100),
});
export type FxRatesQueryDto = z.infer<typeof FxRatesQuerySchema>;

export const QuoteStatusSchema = z.enum([
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'REVIZE',
  'UNSPECIFIED',
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
  paymentTerms: z.string().trim().max(4000).optional(),
  salesTerms: z.string().trim().max(4000).optional(),
  deliveryTerms: z.string().trim().max(4000).optional(),
  generalTerms: z.string().trim().max(4000).optional(),
  /** Tenant'in crm_iban_options listesinden secilir, 4 alani teklife kopyalanir
   * (bkz. QuotesService.resolveIbanSnapshot). */
  ibanOptionId: z.string().uuid().optional(),
  /** Kalemler quoteCurrency disinda bir para biriminde iceriyorsa zorunlu -
   * QuotesService.assertExchangeRatesCoverItems dogrular. */
  quoteCurrency: CurrencyCodeSchema.default('TRY'),
  exchangeRates: QuoteExchangeRatesSchema.optional(),
  /** Ad-hoc: markali PDF sablonu (bkz. docs/VARSAYIMLAR.md V41). Verilmezse
   * tenant'in varsayilan sablonu otomatik atanir (varsa) - bkz. QuotesService.create. */
  templateId: z.string().uuid().nullable().optional(),
  /** Teklifin "gonderen"i (PDF'te gosterilen temsilci) - frontend varsayilan
   * olarak isteği yapan kullaniciyi onceden secili gosterir ama degistirilebilir,
   * bu yuzden zorunlu (createdById'den bagimsiz, bkz. Quote.senderId doc comment'i). */
  senderId: z.string().uuid(),
});
export type CreateQuoteDto = z.infer<typeof CreateQuoteSchema>;
export type QuoteItemInputDto = z.infer<typeof QuoteItemInputSchema>;

export const UpdateQuoteSchema = z
  .object({
    items: z.array(QuoteItemInputSchema).min(1).max(200).optional(),
    /** /teklifler listesindeki durum dropdown'undan gelen dogrudan durum degisikligi. */
    status: QuoteStatusSchema.optional(),
    /** Status 'APPROVED' ise zorunlu - hangi depodan otomatik dusulecegi (bkz.
     * docs/PLAN_STOK_MALIYET.md Faz 4, QuotesService.ensureStockDecreaseForQuote). */
    warehouseId: z.string().uuid().optional(),
    /** Ad-hoc revizyon takibi: teklif REVIZE durumundayken `items` ile birlikte
     * gonderilirse zorunludur (bkz. QuotesService.update, revisionNote dogrulamasi). */
    revisionNote: z.string().trim().min(1).max(2000).optional(),
    /** null verilirse muhatap kisi kaldirilir, alan hic verilmezse mevcut deger korunur. */
    contactId: z.string().uuid().nullable().optional(),
    quoteDate: z.coerce.date().optional(),
    /** null verilirse alan temizlenir, hic verilmezse mevcut deger korunur. */
    leadTime: z.string().trim().max(200).nullable().optional(),
    paymentMethod: z.string().trim().max(200).nullable().optional(),
    title: z.string().trim().max(200).nullable().optional(),
    paymentTerms: z.string().trim().max(4000).nullable().optional(),
    salesTerms: z.string().trim().max(4000).nullable().optional(),
    deliveryTerms: z.string().trim().max(4000).nullable().optional(),
    generalTerms: z.string().trim().max(4000).nullable().optional(),
    /** null verilirse IBAN snapshot'i temizlenir, hic verilmezse mevcut deger korunur. */
    ibanOptionId: z.string().uuid().nullable().optional(),
    quoteCurrency: CurrencyCodeSchema.optional(),
    exchangeRates: QuoteExchangeRatesSchema.optional(),
    /** null verilirse sablon kaldirilir (sade export'a doner), hic verilmezse mevcut
     * deger korunur. */
    templateId: z.string().uuid().nullable().optional(),
    /** Verilirse gonderen degistirilir, hic verilmezse mevcut deger korunur. */
    senderId: z.string().uuid().optional(),
    /** Status 'REJECTED' ise zorunlu - kullanicinin crm_quote_rejection_reason_options
     * listesinden sectigi red sebebi (bkz. QuotesListPage'deki durum dropdown'u,
     * ApproveQuoteModal ile ayni "once onay, sonra geri bildirim" deseni). */
    rejectionReason: z.string().trim().min(1).optional(),
    /** Opsiyonel ek aciklama - hangi sebep secilirse secilsin girilebilir. */
    rejectionNote: z.string().trim().max(2000).optional(),
  })
  .refine((dto) => dto.status !== 'APPROVED' || dto.warehouseId !== undefined, {
    message: 'Onaylamak icin depo secimi gerekli.',
    path: ['warehouseId'],
  })
  .refine(
    (dto) => dto.status !== 'REJECTED' || dto.rejectionReason !== undefined,
    {
      message: 'Red sebebi secimi gerekli.',
      path: ['rejectionReason'],
    },
  );
export type UpdateQuoteDto = z.infer<typeof UpdateQuoteSchema>;

/** `POST /quotes/:id/approve` - hangi depodan otomatik dusulecegi (bkz.
 * docs/PLAN_STOK_MALIYET.md Faz 4 karar 5: kullanici her onayda depoyu secer). */
export const ApproveQuoteSchema = z.object({
  warehouseId: z.string().uuid('Depo secimi gerekli.'),
});
export type ApproveQuoteDto = z.infer<typeof ApproveQuoteSchema>;

/** `POST /quotes/:id/reject` - ApproveQuoteSchema ile ayni "once onay, sonra geri
 * bildirim modali" deseni: kullanici bir red sebebi secer (tanimli listeden, bkz.
 * QuoteRejectionReasonOption), istege bagli olarak ek aciklama ekleyebilir. */
export const RejectQuoteSchema = z.object({
  reason: z.string().trim().min(1, 'Red sebebi secimi gerekli.'),
  note: z.string().trim().max(2000).optional(),
});
export type RejectQuoteDto = z.infer<typeof RejectQuoteSchema>;

export const QuoteQuerySchema = ListQuerySchema.extend({
  accountId: z.string().uuid().optional(),
  status: QuoteStatusSchema.optional(),
  /** Kaydi olusturan kullaniciya gore filtre (liste sayfasi filtre penceresi). */
  createdById: z.string().optional(),
  /** Teklif tarihi filtresi (liste sayfasi filtre penceresi) - hem tek tarih ("su
   * tarihten itibaren") hem aralik ("iki tarih arasi") secimi frontend'de bu ayni
   * from/to ciftine cevrilir - bkz. opportunity.dto.ts'teki ayni desen. */
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
/** `q` (ListQuerySchema'dan miras) - serbest metin arama: baslik, teklif no, firma adi,
 * olusturan kullanici adi (bkz. QuotesService.list). */
export type QuoteQueryDto = z.infer<typeof QuoteQuerySchema>;

/** /teklifler?tab=reports filtre penceresi - KPI kartlari/grafikler icin ayni
 * tek-tarih/aralik deseni (bkz. QuoteQuerySchema.from/to), ama sayfalama/arama yok. */
export const QuoteReportsQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type QuoteReportsQueryDto = z.infer<typeof QuoteReportsQuerySchema>;
