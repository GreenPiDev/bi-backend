import { z } from 'zod';

export const ForgotPasswordSchema = z.object({
  email: z.string().trim().email().max(255),
});

export const ResetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password: z.string().min(8).max(72),
});

export type ForgotPasswordDto = z.infer<typeof ForgotPasswordSchema>;
export type ResetPasswordDto = z.infer<typeof ResetPasswordSchema>;
