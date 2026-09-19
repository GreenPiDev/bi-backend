import { describe, expect, it } from 'vitest';
import { parseImportNumber } from './number-format';

describe('parseImportNumber', () => {
  it('tr: "1.234,56" -> 1234.56 (nokta bin ayraci, virgul ondalik)', () => {
    expect(parseImportNumber('1.234,56', 'tr')).toBe(1234.56);
  });

  it('tr: "65.056,00" -> 65056 (ABB gercek dosyasindaki fiyat formati)', () => {
    expect(parseImportNumber('65.056,00', 'tr')).toBe(65056);
  });

  it('tr: "253" -> 253 (Schneider gercek dosyasindaki duz tam sayi)', () => {
    expect(parseImportNumber('253', 'tr')).toBe(253);
  });

  it('tr: kayan nokta gurultulu XLSX sayisal hucresini bozmaz (regresyon)', () => {
    // Schneider'in gercek dosyasinda "Akim Trafosu" fiyat hucreleri XLSX'te sayi
    // olarak saklanmis; JS String() donusumu 29.2'yi "29.200000000000003" yapiyor.
    // Bu, TR kuralinin (noktalari sil) yanlislikla 292000000000003'e sismesine yol
    // acmisti (bkz. docs/VARSAYIMLAR.md V40).
    expect(parseImportNumber('29.200000000000003', 'tr')).toBeCloseTo(29.2, 5);
  });

  it('tr: "1.234" (ondalik yok) -> 1234 (gercek TR gruplama, tek nokta)', () => {
    expect(parseImportNumber('1.234', 'tr')).toBe(1234);
  });

  it('en: "1234.56" -> 1234.56', () => {
    expect(parseImportNumber('1234.56', 'en')).toBe(1234.56);
  });

  it('en: "1,234.56" -> 1234.56 (virgul bin ayraci)', () => {
    expect(parseImportNumber('1,234.56', 'en')).toBe(1234.56);
  });

  it('bos/tanimsiz deger icin undefined doner', () => {
    expect(parseImportNumber('', 'tr')).toBeUndefined();
    expect(parseImportNumber(undefined, 'tr')).toBeUndefined();
    expect(parseImportNumber('   ', 'en')).toBeUndefined();
  });

  it('sayi olmayan deger icin undefined doner', () => {
    expect(parseImportNumber('abc', 'tr')).toBeUndefined();
  });
});
