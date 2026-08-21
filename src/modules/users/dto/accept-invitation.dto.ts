import { z } from 'zod';

export const AcceptInvitationSchema = z.object({
  name: z.string().min(1).max(120),
  password: z.string().min(8).max(72),
});

export type AcceptInvitationDto = z.infer<typeof AcceptInvitationSchema>;
