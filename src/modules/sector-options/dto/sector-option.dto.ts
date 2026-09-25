import { z } from 'zod';

export const CreateSectorOptionSchema = z.object({
  label: z
    .string()
    .trim()
    .min(2, 'Sektor adi en az 2 karakter olmalidir.')
    .max(200),
});
export type CreateSectorOptionDto = z.infer<typeof CreateSectorOptionSchema>;

export const UpdateSectorOptionSchema = CreateSectorOptionSchema;
export type UpdateSectorOptionDto = z.infer<typeof UpdateSectorOptionSchema>;
