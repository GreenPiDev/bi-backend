import { z } from 'zod';
import { ListQuerySchema } from '../../../core/dto/list-query.dto';

const PriceListItemInputSchema = z.object({
  productId: z.string().uuid(),
  unitPrice: z.number().nonnegative(),
});

function hasUniqueProductIds(items: { productId: string }[]): boolean {
  return new Set(items.map((item) => item.productId)).size === items.length;
}

export const CreatePriceListSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Fiyat listesi adi en az 2 karakter olmalidir.'),
  isDefault: z.boolean().optional(),
  items: z
    .array(PriceListItemInputSchema)
    .max(500)
    .default([])
    .refine(hasUniqueProductIds, {
      message: 'Ayni urun fiyat listesinde birden fazla kez yer alamaz.',
    }),
});
export type CreatePriceListDto = z.infer<typeof CreatePriceListSchema>;

export const UpdatePriceListSchema = z.object({
  name: z.string().trim().min(2).optional(),
  isDefault: z.boolean().optional(),
  items: z
    .array(PriceListItemInputSchema)
    .max(500)
    .refine(hasUniqueProductIds, {
      message: 'Ayni urun fiyat listesinde birden fazla kez yer alamaz.',
    })
    .optional(),
});
export type UpdatePriceListDto = z.infer<typeof UpdatePriceListSchema>;

export const PriceListQuerySchema = ListQuerySchema;
export type PriceListQueryDto = z.infer<typeof PriceListQuerySchema>;
