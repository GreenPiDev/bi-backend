import { z } from 'zod';

export const UpdateActiveSchema = z.object({
  isActive: z.boolean(),
});

export type UpdateActiveDto = z.infer<typeof UpdateActiveSchema>;
