import { z } from 'zod';

/** Tenant subdomain'i (orn. `greenpi` -> greenpi.pilens.com.tr) olarak kullanilan slug -
 * DNS label kurallarina uygun olmali: kucuk harf/rakam, tirelerle ayrilabilir, bas/son
 * tire olamaz. bkz. core/http/tenant-subdomain.ts, docs/VARSAYIMLAR.md. */
export const UpdateTenantSlugSchema = z.object({
  slug: z
    .string()
    .min(2)
    .max(63)
    .regex(
      /^[a-z0-9]+(-[a-z0-9]+)*$/,
      'Sadece kucuk harf, rakam ve tire kullanilabilir; tire ile baslayamaz/bitemez.',
    ),
});

export type UpdateTenantSlugDto = z.infer<typeof UpdateTenantSlugSchema>;
