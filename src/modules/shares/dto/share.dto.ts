import { z } from 'zod';

/** Link olusturulurken secilebilen gecerlilik sureleri (gun). `null` = suresiz. */
export const SHARE_EXPIRY_DAY_OPTIONS = [7, 30, 90] as const;

export const CreateShareSchema = z.object({
  expiresInDays: z
    .union([z.literal(7), z.literal(30), z.literal(90)])
    .nullable()
    .default(30),
});
export type CreateShareDto = z.infer<typeof CreateShareSchema>;
