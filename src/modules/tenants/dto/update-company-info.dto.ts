import { z } from 'zod';

/** /settings?tab=crm "Sirket Bilgileri" bolumu - adres/telefon/eposta, markali
 * teklif sablonlarinda (bkz. docs/VARSAYIMLAR.md) ve sablonsuz teklif PDF'inde
 * tek, tenant-genel kaynak olarak kullanilir. */
export const UpdateCompanyInfoSchema = z
  .object({
    address: z.string().trim().max(500).nullable().optional(),
    phone: z.string().trim().max(50).nullable().optional(),
    email: z.string().trim().email().max(255).nullable().optional(),
  })
  .refine(
    (data) =>
      data.address !== undefined ||
      data.phone !== undefined ||
      data.email !== undefined,
    { message: 'En az bir alan gonderilmeli.' },
  );

export type UpdateCompanyInfoDto = z.infer<typeof UpdateCompanyInfoSchema>;
