import { z } from 'zod';

export const RegisterSchema = z.object({
  tenantName: z.string().min(2).max(120),
  name: z.string().min(1).max(120),
  email: z.string().email().max(255),
  password: z.string().min(8).max(72),
});

export type RegisterDto = z.infer<typeof RegisterSchema>;
