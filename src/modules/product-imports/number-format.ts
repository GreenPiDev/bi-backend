import type { NumberFormat } from './dto/product-import.dto';

/** Gercek TR gruplama deseni: "1.234", "1.234.567", opsiyonel ",56" ondalik kuyrugu.
 * Bunun disindaki (orn. "29.200000000000003" gibi kayan nokta gurultusu tasiyan) bir
 * deger, XLSX'teki sayisal bir hucrenin oldugu gibi string'e cevrilmis hali olabilir -
 * boyle bir degeri TR kuralina gore "noktalari sil" ile isleseydik deger feci sekilde
 * buyurdu (bkz. docs/VARSAYIMLAR.md V40, gercek Schneider dosyasinda bulunan regresyon:
 * 29.2 -> 292000000000003). Bu yuzden sadece gercekten TR gruplama desenine uyan
 * degerler noktalari kaybediyor; uymayanlar oldugu gibi Number()'a birakiliyor.
 */
const TR_GROUPED_PATTERN = /^-?\d{1,3}(\.\d{3})*(,\d+)?$/;

/**
 * Marka fiyat listeleri farkli sayi formatlarinda gelebiliyor (TR: "1.234,56", EN/US:
 * "65056.00") - hangi formatta oldugunu otomatik tahmin etmek yerine kullanici secer
 * (bkz. docs/VARSAYIMLAR.md V40). Bos/gecersiz deger icin undefined doner.
 */
export function parseImportNumber(
  raw: string | undefined,
  format: NumberFormat,
): number | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return undefined;
  }
  if (format === 'tr') {
    const normalized = TR_GROUPED_PATTERN.test(trimmed)
      ? trimmed.replace(/\./g, '').replace(',', '.')
      : trimmed;
    const value = Number(normalized);
    return Number.isFinite(value) ? value : undefined;
  }
  const value = Number(trimmed.replace(/,/g, ''));
  return Number.isFinite(value) ? value : undefined;
}
