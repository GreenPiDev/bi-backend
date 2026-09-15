import { z } from 'zod';
import { ListQuerySchema } from '../../../core/dto/list-query.dto';

export const CreateProductListSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Urun listesi adi en az 2 karakter olmalidir.'),
  isDefault: z.boolean().optional(),
});
export type CreateProductListDto = z.infer<typeof CreateProductListSchema>;

export const UpdateProductListSchema = z.object({
  name: z.string().trim().min(2).optional(),
  isDefault: z.boolean().optional(),
});
export type UpdateProductListDto = z.infer<typeof UpdateProductListSchema>;

export const ProductListQuerySchema = ListQuerySchema;
export type ProductListQueryDto = z.infer<typeof ProductListQuerySchema>;
