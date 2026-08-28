import { z } from 'zod';

export const InviteUserSchema = z.object({
  email: z.string().email().max(255),
  roleIds: z.array(z.string().uuid()).min(1),
});

export type InviteUserDto = z.infer<typeof InviteUserSchema>;
