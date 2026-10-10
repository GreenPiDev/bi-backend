import { z } from 'zod';
import { ListQuerySchema } from '../../../core/dto/list-query.dto';

/**
 * "Teknik Ozellikler / Pano Cizim Bilgileri" - urunun pano cizim motorunda (bkz.
 * docs/VARSAYIMLAR.md V52) kullanilabilmesi icin gereken opsiyonel geometrik alanlar.
 * Hicbir alan zorunlu degil - doldurulmamissa o urun cizim motorunda kullanilamaz,
 * bu normal bir durumdur. Tum alanlar null kabul eder (UPDATE'te tek tek alan
 * temizlenebilsin diye - formun "Teknik Ozellikler" bolumu her submit'te kendi
 * gorunur alanlarinin tam halini gonderir).
 */
export const ProductDrawingSpecInputSchema = z.object({
  widthMm: z.number().positive().max(10_000).nullable().optional(),
  heightMm: z.number().positive().max(10_000).nullable().optional(),
  depthMm: z.number().positive().max(10_000).nullable().optional(),
  libraryComponentKey: z.string().trim().min(1).max(100).nullable().optional(),
  bandOrder: z.number().int().min(0).max(1000).nullable().optional(),
  /** Hangi banda ait (DrawingPanelTemplate.layout.bands[].key) - bkz. docs/VARSAYIMLAR.md V54. */
  bandKey: z.string().trim().min(1).max(100).nullable().optional(),
});
export type ProductDrawingSpecInputDto = z.infer<
  typeof ProductDrawingSpecInputSchema
>;

export const CreateProductSchema = z.object({
  productListId: z.string().uuid('Gecerli bir urun listesi seciniz.'),
  name: z.string().trim().min(2, 'Urun adi en az 2 karakter olmalidir.'),
  sku: z.string().trim().min(1).optional(),
  unit: z.string().trim().min(1).default('adet'),
  minStockLevel: z.number().int().nonnegative().optional(),
  /** Q7: bu urun icin azami iskonto orani (%). Bos birakilirsa sinir yok sayilir. */
  maxDiscountPct: z.number().min(0).max(100).optional(),
  /** Ad-hoc (bkz. docs/VARSAYIMLAR.md V37): fiyat artik PriceList yerine dogrudan Product'ta.
   * Ust sinir crm_products.price'in DB hassasiyetiyle (Decimal(14,2)) eslesiyor - asimda
   * DB katmaninda cokmek yerine burada okunabilir bir dogrulama hatasi verilsin diye
   * (bkz. docs/VARSAYIMLAR.md V40, Faz B ice aktarmada bir satirin bozuk sayisi tum
   * toplu ekleme islemini patlatmisti). */
  price: z.number().min(0).max(999_999_999_999.99).optional(),
  currency: z.string().trim().length(3).default('TRY'),
  description: z.string().trim().max(2000).optional(),
  category: z.string().trim().max(100).optional(),
  brand: z.string().trim().max(100).optional(),
  drawingSpec: ProductDrawingSpecInputSchema.optional(),
});
export type CreateProductDto = z.infer<typeof CreateProductSchema>;

/** `POST /products` (tekil, elle "Yeni Ürün" formu) icin `CreateProductSchema`'nin fiyati
 * zorunlu kilan sikilastirilmis hali - bkz. kullanici bildirimi. Toplu ice aktarma
 * (`product-imports.service.ts`) hala temel `CreateProductSchema`'yi kullanir, cunku
 * Excel/CSV satirlarinin cogu fiyat kolonu esletirilmeden gelebilir (bkz. CLAUDE.md Faz B,
 * docs/VARSAYIMLAR.md V40) - o akisi kirmamak icin ayri bir sema tutuluyor. */
export const CreateProductManualSchema = CreateProductSchema.required({
  price: true,
});
export type CreateProductManualDto = z.infer<typeof CreateProductManualSchema>;

export const UpdateProductSchema = z.object({
  productListId: z.string().uuid().optional(),
  name: z.string().trim().min(2).optional(),
  sku: z.string().trim().min(1).optional(),
  unit: z.string().trim().min(1).optional(),
  minStockLevel: z.number().int().nonnegative().optional(),
  maxDiscountPct: z.number().min(0).max(100).nullable().optional(),
  price: z.number().min(0).max(999_999_999_999.99).nullable().optional(),
  currency: z.string().trim().length(3).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  category: z.string().trim().max(100).nullable().optional(),
  brand: z.string().trim().max(100).nullable().optional(),
  drawingSpec: ProductDrawingSpecInputSchema.optional(),
});
export type UpdateProductDto = z.infer<typeof UpdateProductSchema>;

export const ProductQuerySchema = ListQuerySchema.extend({
  productListId: z.string().uuid().optional(),
  brand: z.string().trim().min(1).optional(),
  category: z.string().trim().min(1).optional(),
  /** Ozel alan (attributes JSONB) filtreleri: { "Seri": "kWH" } gibi, her key icin
   * serbest metin (case-insensitive contains) araniyor - bkz. CLAUDE.md Faz B. */
  attr: z.record(z.string(), z.string().trim().min(1)).optional(),
  /** "Silinmis Urunleri Goster" switch'i - varsayilan false (yumusak silinmis urunler
   * gizli kalir, tenant-scoped extension'in normal davranisi). true iken hem aktif hem
   * yumusak silinmis urunler donuyor (bkz. products.service.ts list()). z.coerce.boolean()
   * kullanilmadi: query string'de "false" JS'te Boolean("false")===true'ya coerce olurdu. */
  includeDeleted: z
    .preprocess((value) => value === 'true' || value === true, z.boolean())
    .default(false),
  /** Sadece oto. pano cizim motorunda kullanilabilir (drawingSpec'in tum zorunlu
   * alanlari dolu) urunleri dondurur - bkz. drawing-imports onizleme ekrani,
   * `pageSize` sinirinin tum katalogu (binlerce urun olabilir) client'a cekmeden
   * dogru calismasi icin bu filtre backend'de uygulanir. */
  drawable: z
    .preprocess((value) => value === 'true' || value === true, z.boolean())
    .optional(),
});
export type ProductQueryDto = z.infer<typeof ProductQuerySchema>;

export const BulkMoveProductsSchema = z.object({
  productIds: z.array(z.string().uuid()).min(1, 'En az bir urun seciniz.'),
  targetProductListId: z
    .string()
    .uuid('Gecerli bir hedef urun listesi seciniz.'),
});
export type BulkMoveProductsDto = z.infer<typeof BulkMoveProductsSchema>;

export const BulkDeleteProductsSchema = z.object({
  productIds: z.array(z.string().uuid()).min(1, 'En az bir urun seciniz.'),
});
export type BulkDeleteProductsDto = z.infer<typeof BulkDeleteProductsSchema>;

/** Fiyat Gecmisi (/envanter?tab=priceHistory) filtre penceresi: urune ve degisikligi
 * yapan kullaniciya gore - StockHistoryQuerySchema ile ayni desen. */
export const ProductPriceHistoryQuerySchema = z.object({
  productId: z.string().optional(),
  userId: z.string().optional(),
});
export type ProductPriceHistoryQueryDto = z.infer<
  typeof ProductPriceHistoryQuerySchema
>;
