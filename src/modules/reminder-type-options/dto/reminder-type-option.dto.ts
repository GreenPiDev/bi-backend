import { z } from 'zod';

export const CreateReminderTypeOptionSchema = z.object({
  label: z
    .string()
    .trim()
    .min(2, 'Hatirlatici turu adi en az 2 karakter olmalidir.')
    .max(200),
});
export type CreateReminderTypeOptionDto = z.infer<
  typeof CreateReminderTypeOptionSchema
>;

export const UpdateReminderTypeOptionSchema = CreateReminderTypeOptionSchema;
export type UpdateReminderTypeOptionDto = z.infer<
  typeof UpdateReminderTypeOptionSchema
>;
