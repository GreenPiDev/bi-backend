import { z } from 'zod';

export const UpdateProfileSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    email: z.string().email().max(255).optional(),
  })
  .refine((data) => data.name !== undefined || data.email !== undefined, {
    message: 'En az bir alan gonderilmeli.',
  });

export type UpdateProfileDto = z.infer<typeof UpdateProfileSchema>;
