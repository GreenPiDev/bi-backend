import { z } from 'zod';

export const InviteUserSchema = z.object({
  email: z.string().email().max(255),
  role: z.enum(['ADMIN', 'EDITOR', 'VIEWER']),
});

export type InviteUserDto = z.infer<typeof InviteUserSchema>;
