import { z } from 'zod';
import { ListQuerySchema } from '../../../core/dto/list-query.dto';

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
  /** costPrice Decimal(12,2). */
  costPrice: z.number().min(0).max(9_999_999_999.99).optional(),
});
export type CreateProductDto = z.infer<typeof CreateProductSchema>;

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
  costPrice: z.number().min(0).max(9_999_999_999.99).nullable().optional(),
});
export type UpdateProductDto = z.infer<typeof UpdateProductSchema>;

export const ProductQuerySchema = ListQuerySchema.extend({
  productListId: z.string().uuid().optional(),
});
export type ProductQueryDto = z.infer<typeof ProductQuerySchema>;
