import * as ExcelJS from 'exceljs';

/**
 * `ImportsService.toXlsxBuffer` (eski private metod) buraya tasindi - Faz 11c'nin
 * interactions export'u ikinci kullanici oldugunda ayni mantigin ikinci kopyasini
 * yazmak yerine `list-pdf.service.ts` ile ayni gerekceyle paylasimli bir yardimciya
 * cikarildi. Stateless (exceljs disinda bagimlilik yok) oldugundan bir Nest servisi
 * degil, duz bir fonksiyon.
 */
const MIN_COLUMN_WIDTH = 10;
const MAX_COLUMN_WIDTH = 60;
// Excel'in "karakter genisligi" birimi yaklasik olarak varsayilan fontta bir
// rakam/harf genisligine denk gelir - buraya eklenen pay (2), hucre kenar
// bosluklari hicbir karakterin kesilmemesi icin.
const COLUMN_WIDTH_PADDING = 2;

export async function rowsToXlsxBuffer(
  rows: Record<string, string>[],
  sheetName: string,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName);
  if (rows.length > 0) {
    const keys = Object.keys(rows[0]);
    worksheet.columns = keys.map((key) => {
      const longest = rows.reduce(
        (max, row) => Math.max(max, (row[key] ?? '').length),
        key.length,
      );
      return {
        header: key,
        key,
        width: Math.min(
          Math.max(longest + COLUMN_WIDTH_PADDING, MIN_COLUMN_WIDTH),
          MAX_COLUMN_WIDTH,
        ),
      };
    });
    worksheet.addRows(rows);
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
