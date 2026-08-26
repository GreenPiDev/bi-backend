import { z } from 'zod';

export const UpdateRoleSchema = z.object({
  role: z.enum(['OWNER', 'ADMIN', 'EDITOR', 'SALES', 'VIEWER']),
});

export type UpdateRoleDto = z.infer<typeof UpdateRoleSchema>;
