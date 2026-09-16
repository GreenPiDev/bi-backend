import { z } from 'zod';

export const CreateDepartmentOptionSchema = z.object({
  label: z
    .string()
    .trim()
    .min(2, 'Departman adi en az 2 karakter olmalidir.')
    .max(200),
});
export type CreateDepartmentOptionDto = z.infer<
  typeof CreateDepartmentOptionSchema
>;
