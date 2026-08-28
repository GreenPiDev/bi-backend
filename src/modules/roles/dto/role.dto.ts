import { z } from 'zod';

const PermissionActionSchema = z.enum([
  'VIEW',
  'CREATE',
  'UPDATE',
  'DELETE',
  'IMPORT',
  'EXPORT',
]);

const RolePermissionInputSchema = z.object({
  pageKey: z.string().min(1),
  tabKey: z.string().min(1).nullable().optional(),
  actions: z.array(PermissionActionSchema).min(1),
});

export const CreateRoleSchema = z.object({
  name: z.string().trim().min(2).max(100),
  permissions: z.array(RolePermissionInputSchema).default([]),
});
export type CreateRoleDto = z.infer<typeof CreateRoleSchema>;

export const UpdateRoleSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  permissions: z.array(RolePermissionInputSchema).optional(),
});
export type UpdateRoleDto = z.infer<typeof UpdateRoleSchema>;
