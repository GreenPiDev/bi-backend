import { z } from 'zod';

export const CreateUnitOptionSchema = z.object({
  label: z.string().trim().min(1, 'Birim adi gereklidir.').max(50),
});
export type CreateUnitOptionDto = z.infer<typeof CreateUnitOptionSchema>;

export const UpdateUnitOptionSchema = CreateUnitOptionSchema;
export type UpdateUnitOptionDto = z.infer<typeof UpdateUnitOptionSchema>;
