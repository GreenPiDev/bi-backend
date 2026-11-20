import * as ExcelJS from 'exceljs';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppException } from '../../core/errors/app.exception';
import {
  argbToHex,
  cellAddress,
  cellValueToDisplay,
  columnLetter,
  parseSpreadsheetFile,
} from './spreadsheet-file-parser';

describe('spreadsheet-file-parser', () => {
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pilens-spreadsheet-'));
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('reads all worksheets with values and solid fill / font colors', async () => {
    const workbook = new ExcelJS.Workbook();
    const stok = workbook.addWorksheet('Stok');
    stok.getCell('A1').value = 'Ürün Adı';
    stok.getCell('B1').value = 'Miktar';
    stok.getCell('A2').value = 'Şalter';
    stok.getCell('B2').value = 0.1 + 0.2;
    stok.getCell('B2').fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFFF00' },
    };
    stok.getCell('A2').font = { color: { argb: 'FFff0000' } };
    stok.getCell('C3').value = new Date(Date.UTC(2026, 2, 1));
    stok.getColumn(1).width = 30;
    const other = workbook.addWorksheet('Depo');
    other.getCell('A1').value = 'İstanbul';
    const filePath = path.join(tmpDir, 'stok.xlsx');
    await workbook.xlsx.writeFile(filePath);

    const sheets = await parseSpreadsheetFile(filePath, 'XLSX');

    expect(sheets.map((s) => s.name)).toEqual(['Stok', 'Depo']);
    expect(sheets[0].rowCount).toBe(3);
    expect(sheets[0].colCount).toBe(3);
    // 30 karakter * 7 + 5 = 215 px; genisligi ayarlanmamis sutunlar haritada yok.
    expect(sheets[0].colWidths).toEqual({ '0': 215 });
    const byAddress = new Map(
      sheets[0].cells.map((c) => [cellAddress(c.row, c.col), c]),
    );
    expect(byAddress.get('A1')?.value).toBe('Ürün Adı');
    expect(byAddress.get('B2')).toMatchObject({
      value: '0.3',
      bgColor: '#FFFF00',
    });
    expect(byAddress.get('A2')).toMatchObject({
      value: 'Şalter',
      fontColor: '#FF0000',
    });
    expect(byAddress.get('C3')?.value).toBe('01.03.2026');
    expect(sheets[1].cells[0].value).toBe('İstanbul');
  });

  it('parses csv into a single sheet without colors', async () => {
    const filePath = path.join(tmpDir, 'stok.csv');
    await fs.writeFile(filePath, '﻿Ürün,Miktar\nKablo,"1.234,56"\n');

    const [sheet] = await parseSpreadsheetFile(filePath, 'CSV');

    expect(sheet.name).toBe('Sayfa1');
    expect(sheet.cells).toEqual([
      { row: 0, col: 0, value: 'Ürün', bgColor: null, fontColor: null },
      { row: 0, col: 1, value: 'Miktar', bgColor: null, fontColor: null },
      { row: 1, col: 0, value: 'Kablo', bgColor: null, fontColor: null },
      { row: 1, col: 1, value: '1.234,56', bgColor: null, fontColor: null },
    ]);
  });

  it('throws EMPTY_FILE when there is no data', async () => {
    const filePath = path.join(tmpDir, 'empty.csv');
    await fs.writeFile(filePath, '');
    await expect(parseSpreadsheetFile(filePath, 'CSV')).rejects.toMatchObject({
      code: 'EMPTY_FILE',
    });
  });

  it('rejects a broken xlsx with XLSX_PARSE_FAILED', async () => {
    const filePath = path.join(tmpDir, 'broken.xlsx');
    await fs.writeFile(filePath, 'not a zip');
    const error = await parseSpreadsheetFile(filePath, 'XLSX').catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).code).toBe('XLSX_PARSE_FAILED');
  });

  it('formats helpers correctly', () => {
    expect(columnLetter(0)).toBe('A');
    expect(columnLetter(25)).toBe('Z');
    expect(columnLetter(26)).toBe('AA');
    expect(columnLetter(701)).toBe('ZZ');
    expect(cellAddress(11, 1)).toBe('B12');
    expect(argbToHex({ argb: 'FF00aa11' })).toBe('#00AA11');
    expect(argbToHex({ theme: 1 } as Partial<ExcelJS.Color>)).toBeNull();
    expect(cellValueToDisplay({ formula: 'A1*2', result: 4 })).toBe('4');
    expect(cellValueToDisplay(true)).toBe('DOĞRU');
  });
});
