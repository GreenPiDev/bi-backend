import * as ExcelJS from 'exceljs';

/**
 * `ImportsService.toXlsxBuffer` (eski private metod) buraya tasindi - Faz 11c'nin
 * interactions export'u ikinci kullanici oldugunda ayni mantigin ikinci kopyasini
 * yazmak yerine `list-pdf.service.ts` ile ayni gerekceyle paylasimli bir yardimciya
 * cikarildi. Stateless (exceljs disinda bagimlilik yok) oldugundan bir Nest servisi
 * degil, duz bir fonksiyon.
 */
export async function rowsToXlsxBuffer(
  rows: Record<string, string>[],
  sheetName: string,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName);
  if (rows.length > 0) {
    worksheet.columns = Object.keys(rows[0]).map((key) => ({
      header: key,
      key,
    }));
    worksheet.addRows(rows);
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
