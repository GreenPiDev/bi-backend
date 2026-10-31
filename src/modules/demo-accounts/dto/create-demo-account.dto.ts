import { z } from 'zod';

export const CreateDemoAccountSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(72),
});

export type CreateDemoAccountDto = z.infer<typeof CreateDemoAccountSchema>;
