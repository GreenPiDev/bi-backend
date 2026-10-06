import { z } from 'zod';

export const CreateDrawingLibraryComponentSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1, 'Anahtar gereklidir.')
    .max(100)
    .regex(
      /^[a-z0-9-]+$/,
      'Anahtar sadece kucuk harf, rakam ve tire (-) icerebilir.',
    ),
  name: z.string().trim().min(2, 'Ad en az 2 karakter olmalidir.').max(200),
  category: z.string().trim().min(1, 'Kategori gereklidir.').max(100),
  defaultWidthMm: z.number().positive().max(10_000),
  defaultHeightMm: z.number().positive().max(10_000),
  symbol: z.record(z.string(), z.unknown()).optional(),
});
export type CreateDrawingLibraryComponentDto = z.infer<
  typeof CreateDrawingLibraryComponentSchema
>;

export const UpdateDrawingLibraryComponentSchema =
  CreateDrawingLibraryComponentSchema.partial();
export type UpdateDrawingLibraryComponentDto = z.infer<
  typeof UpdateDrawingLibraryComponentSchema
>;
