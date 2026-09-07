import { z } from 'zod';

export const CreateTenantSchema = z.object({
  tenantName: z.string().min(2).max(120),
  adminName: z.string().min(1).max(120),
  adminEmail: z.string().email().max(255),
});

export type CreateTenantDto = z.infer<typeof CreateTenantSchema>;
