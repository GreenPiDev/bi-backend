import { z } from 'zod';

/** Tenant'in yetkilisinin (ilk COMPANYADMIN kullanicisi) giris e-postasi. */
export const UpdateTenantAdminEmailSchema = z.object({
  email: z.string().trim().email().max(255),
});

export type UpdateTenantAdminEmailDto = z.infer<
  typeof UpdateTenantAdminEmailSchema
>;
