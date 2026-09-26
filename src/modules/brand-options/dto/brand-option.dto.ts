import { z } from 'zod';

export const CreateBrandOptionSchema = z.object({
  label: z
    .string()
    .trim()
    .min(2, 'Marka adi en az 2 karakter olmalidir.')
    .max(200),
});
export type CreateBrandOptionDto = z.infer<typeof CreateBrandOptionSchema>;

export const UpdateBrandOptionSchema = CreateBrandOptionSchema;
export type UpdateBrandOptionDto = z.infer<typeof UpdateBrandOptionSchema>;
