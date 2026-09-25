import { z } from 'zod';

export const CreatePaymentMethodOptionSchema = z.object({
  label: z
    .string()
    .trim()
    .min(2, 'Odeme yontemi adi en az 2 karakter olmalidir.')
    .max(200),
});
export type CreatePaymentMethodOptionDto = z.infer<
  typeof CreatePaymentMethodOptionSchema
>;

export const UpdatePaymentMethodOptionSchema = CreatePaymentMethodOptionSchema;
export type UpdatePaymentMethodOptionDto = z.infer<
  typeof UpdatePaymentMethodOptionSchema
>;
