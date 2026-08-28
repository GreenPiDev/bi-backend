import { z } from 'zod';

export const UpdateRoleSchema = z.object({
  roleIds: z.array(z.string().uuid()).min(1),
});

export type UpdateRoleDto = z.infer<typeof UpdateRoleSchema>;
