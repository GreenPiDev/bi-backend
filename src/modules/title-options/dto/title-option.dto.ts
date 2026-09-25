import { z } from 'zod';

export const CreateTitleOptionSchema = z.object({
  label: z
    .string()
    .trim()
    .min(2, 'Unvan adi en az 2 karakter olmalidir.')
    .max(200),
});
export type CreateTitleOptionDto = z.infer<typeof CreateTitleOptionSchema>;

export const UpdateTitleOptionSchema = CreateTitleOptionSchema;
export type UpdateTitleOptionDto = z.infer<typeof UpdateTitleOptionSchema>;
