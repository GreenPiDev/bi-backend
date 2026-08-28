import { z } from 'zod';

export const UpdateTenantSettingSchema = z.object({
  value: z.unknown(),
});
export type UpdateTenantSettingDto = z.infer<typeof UpdateTenantSettingSchema>;

export interface TenantSettingResponse {
  key: string;
  value: unknown;
  isDefault: boolean;
}
