// Turkce karakterleri ASCII buyuk harf karsiliklarina cevirir. slugify()'dan
// (modules/tenants/slugify.ts) kasitli olarak ayri: o kucuk harfe cevirip
// noktalari da tireye donusturuyor, kullanicinin istedigi indirilen dosya adi
// formati ise BUYUK harf ve "A.S" gibi noktalari koruyor (bkz. kullanici ornegi).
const TR_UPPER_MAP: Record<string, string> = {
  Ğ: 'G',
  ğ: 'G',
  Ü: 'U',
  ü: 'U',
  Ş: 'S',
  ş: 'S',
  Ö: 'O',
  ö: 'O',
  Ç: 'C',
  ç: 'C',
  İ: 'I',
};

/** Teklif PDF'inin indirilen dosya adi: "<teklifNumarasi>-<SLUGLANMIS-FIRMA-ADI>"
 * (uzanti controller'da eklenir). Ornek: TEK-2026-10-21-002-3AB-ENERJI-VE-SANAYI-
 * TESISLERI-TICARET-A.S */
export function buildQuotePdfFilename(
  quoteNumber: string,
  accountName: string,
): string {
  const transliterated = accountName
    .split('')
    .map((char) => TR_UPPER_MAP[char] ?? char)
    .join('')
    .toUpperCase();

  const slug = transliterated
    .replace(/\s+/g, '-')
    .replace(/[^A-Z0-9.-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');

  return `${quoteNumber}-${slug}`;
}
