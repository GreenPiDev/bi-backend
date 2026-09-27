import { z } from 'zod';

export const CreateInteractionTypeOptionSchema = z.object({
  label: z
    .string()
    .trim()
    .min(2, 'Gorusme sekli adi en az 2 karakter olmalidir.')
    .max(200),
});
export type CreateInteractionTypeOptionDto = z.infer<
  typeof CreateInteractionTypeOptionSchema
>;

export const UpdateInteractionTypeOptionSchema =
  CreateInteractionTypeOptionSchema;
export type UpdateInteractionTypeOptionDto = z.infer<
  typeof UpdateInteractionTypeOptionSchema
>;
