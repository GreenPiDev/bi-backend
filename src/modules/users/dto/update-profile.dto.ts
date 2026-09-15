import { z } from 'zod';

export const UpdateProfileSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    email: z.string().email().max(255).optional(),
    /** Liste sayfalarinda bir seferde kac kayit cekilecegi - profil sayfasindan
     * secilir, sadece 10/25/50 desteklenir (bkz. docs/VARSAYIMLAR.md). */
    defaultPageSize: z
      .union([z.literal(10), z.literal(25), z.literal(50)])
      .optional(),
  })
  .refine(
    (data) =>
      data.name !== undefined ||
      data.email !== undefined ||
      data.defaultPageSize !== undefined,
    { message: 'En az bir alan gonderilmeli.' },
  );

export type UpdateProfileDto = z.infer<typeof UpdateProfileSchema>;
