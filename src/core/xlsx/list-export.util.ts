import { z } from 'zod';

export interface ExportColumnDef<T> {
  header: string;
  value: (row: T) => string;
}

/**
 * Birden fazla "Excel'e Aktar" ucunun (satis siparisleri, firmalar, kisiler,
 * gorusmeler...) paylastigi ortak query-param semasi: virgulle ayrilmis kolon
 * anahtarlarini diziye cevirir. Degerler sabit bir enum'a karsi DOGRULANMAZ -
 * cagiran servis, bilinmeyen/hatali bir anahtar icin resolveColumn'dan undefined
 * donup sessizce atlar (orn. accounts'taki tenant'a ozgu `attr:<key>` custom-field
 * kolonlari icin bu zorunlu, sabit bir enum mumkun degil - bkz. buildExportRows).
 */
export const ExportColumnsQuerySchema = z
  .string()
  .min(1)
  .transform((value) =>
    value
      .split(',')
      .map((key) => key.trim())
      .filter(Boolean),
  )
  .pipe(z.array(z.string()).min(1));

/**
 * "O anda ekranda ACIK olan filtreyle eslesen kayitlari, o anda GORUNUR olan
 * kolonlarla disa aktar" deseninin ortak son adimi - her modul kendi
 * `ExportColumnDef<T>` tanimlarini/cozumleyicisini (resolveColumn) tutar, bu
 * yardimci sadece istenen kolonlari sirayla gezip satirlari
 * `Record<header, deger>` haline getirir (rowsToXlsxBuffer'in bekledigi format).
 * Bilinmeyen bir kolon anahtari (resolveColumn undefined donerse) sessizce
 * atlanir - frontend zaten sadece gercekten var olan kolon anahtarlarini
 * gonderir, bu sadece savunma amaclidir.
 */
export function buildExportRows<T>(
  rows: T[],
  columnKeys: readonly string[],
  resolveColumn: (key: string) => ExportColumnDef<T> | undefined,
): Record<string, string>[] {
  const defs = columnKeys
    .map((key) => resolveColumn(key))
    .filter((def): def is ExportColumnDef<T> => Boolean(def));
  return rows.map((row) => {
    const result: Record<string, string> = {};
    for (const def of defs) {
      result[def.header] = def.value(row);
    }
    return result;
  });
}
