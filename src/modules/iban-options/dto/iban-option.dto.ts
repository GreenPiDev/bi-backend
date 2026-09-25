import { z } from 'zod';

/** Genel IBAN yapi kontrolu (ulke kodu + kontrol basamagi + BBAN) - tam mod-97
 * checksum dogrulamasi yapilmaz, sadece bariz hatali girisleri engeller. */
const IBAN_PATTERN = /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/;

function normalizeIban(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase();
}

export const IbanOptionSchema = z.object({
  bankName: z
    .string()
    .trim()
    .min(2, 'Banka adi en az 2 karakter olmalidir.')
    .max(200),
  accountHolderName: z
    .string()
    .trim()
    .min(2, 'Alici adi en az 2 karakter olmalidir.')
    .max(200),
  accountNumber: z.string().trim().max(50).optional(),
  iban: z
    .string()
    .transform(normalizeIban)
    .pipe(z.string().regex(IBAN_PATTERN, 'Gecerli bir IBAN numarasi giriniz.')),
});
export type IbanOptionDto = z.infer<typeof IbanOptionSchema>;
