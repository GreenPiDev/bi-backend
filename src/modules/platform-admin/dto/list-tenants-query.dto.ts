import { z } from 'zod';

export const ListTenantsQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
});

export type ListTenantsQueryDto = z.infer<typeof ListTenantsQuerySchema>;
