import { z } from 'zod';

export const CreateUserSchema = z.object({
  email: z.string().email().max(255),
  name: z.string().min(1).max(255),
  roleIds: z.array(z.string().uuid()).min(1),
});

export type CreateUserDto = z.infer<typeof CreateUserSchema>;
