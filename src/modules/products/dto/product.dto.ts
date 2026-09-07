import { z } from 'zod';
import { ListQuerySchema } from '../../../core/dto/list-query.dto';

export const CreateProductSchema = z.object({
  name: z.string().trim().min(2, 'Urun adi en az 2 karakter olmalidir.'),
  sku: z.string().trim().min(1).optional(),
  unit: z.string().trim().min(1).default('adet'),
  minStockLevel: z.number().int().nonnegative().optional(),
  /** Q7: bu urun icin azami iskonto orani (%). Bos birakilirsa sinir yok sayilir. */
  maxDiscountPct: z.number().min(0).max(100).optional(),
  description: z.string().trim().max(2000).optional(),
  category: z.string().trim().max(100).optional(),
  costPrice: z.number().min(0).optional(),
});
export type CreateProductDto = z.infer<typeof CreateProductSchema>;

export const UpdateProductSchema = z.object({
  name: z.string().trim().min(2).optional(),
  sku: z.string().trim().min(1).optional(),
  unit: z.string().trim().min(1).optional(),
  minStockLevel: z.number().int().nonnegative().optional(),
  maxDiscountPct: z.number().min(0).max(100).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  category: z.string().trim().max(100).nullable().optional(),
  costPrice: z.number().min(0).nullable().optional(),
});
export type UpdateProductDto = z.infer<typeof UpdateProductSchema>;

export const ProductQuerySchema = ListQuerySchema;
export type ProductQueryDto = z.infer<typeof ProductQuerySchema>;
