import { z } from 'zod';
import { ListQuerySchema } from '../../../core/dto/list-query.dto';

export const CreateWarehouseSchema = z.object({
  name: z.string().trim().min(2, 'Depo adi en az 2 karakter olmalidir.'),
  address: z.string().trim().max(500).optional(),
  isDefault: z.boolean().optional(),
});
export type CreateWarehouseDto = z.infer<typeof CreateWarehouseSchema>;

export const UpdateWarehouseSchema = z.object({
  name: z.string().trim().min(2).optional(),
  address: z.string().trim().max(500).optional(),
  isDefault: z.boolean().optional(),
});
export type UpdateWarehouseDto = z.infer<typeof UpdateWarehouseSchema>;

export const WarehouseQuerySchema = ListQuerySchema;
export type WarehouseQueryDto = z.infer<typeof WarehouseQuerySchema>;
