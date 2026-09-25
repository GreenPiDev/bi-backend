import { z } from 'zod';

export const CreateProductCategorySchema = z.object({
  label: z
    .string()
    .trim()
    .min(2, 'Kategori adi en az 2 karakter olmalidir.')
    .max(200),
});
export type CreateProductCategoryDto = z.infer<
  typeof CreateProductCategorySchema
>;

export const UpdateProductCategorySchema = CreateProductCategorySchema;
export type UpdateProductCategoryDto = z.infer<
  typeof UpdateProductCategorySchema
>;
