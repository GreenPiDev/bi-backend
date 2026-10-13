import { z } from 'zod';

export const IbanOptionGroupSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Grup adi en az 2 karakter olmalidir.')
    .max(200),
  isDefault: z.boolean().optional(),
});
export type IbanOptionGroupDto = z.infer<typeof IbanOptionGroupSchema>;
