import * as ExcelJS from 'exceljs';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FileParserService } from './file-parser.service';

async function collect(rows: AsyncIterable<string[]>): Promise<string[][]> {
  const out: string[][] = [];
  for await (const row of rows) {
    out.push(row);
  }
  return out;
}

describe('FileParserService', () => {
  let service: FileParserService;
  let tmpDir: string;

  beforeAll(async () => {
    service = new FileParserService();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pusula-file-parser-'));
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('CSV', () => {
    it('parses headers and streams data rows', async () => {
      const filePath = path.join(tmpDir, 'sample.csv');
      await fs.writeFile(
        filePath,
        'Musteri Adi,Tutar,Tarih\nAhmet,"1.234,56",01.03.2026\nAyse,999,15.12.2025\n',
        'utf-8',
      );

      const parsed = await service.parse(filePath, 'CSV');
      expect(parsed.headers).toEqual(['Musteri Adi', 'Tutar', 'Tarih']);

      const rows = await collect(parsed.rows);
      expect(rows).toEqual([
        ['Ahmet', '1.234,56', '01.03.2026'],
        ['Ayse', '999', '15.12.2025'],
      ]);
    });

    it('throws EMPTY_FILE for an empty csv', async () => {
      const filePath = path.join(tmpDir, 'empty.csv');
      await fs.writeFile(filePath, '', 'utf-8');
      await expect(service.parse(filePath, 'CSV')).rejects.toMatchObject({
        code: 'EMPTY_FILE',
      });
    });
  });

  describe('XLSX', () => {
    it('parses headers and streams data rows', async () => {
      const filePath = path.join(tmpDir, 'sample.xlsx');
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Sayfa1');
      sheet.addRow(['Ad', 'Tutar']);
      sheet.addRow(['Ahmet', 100]);
      sheet.addRow(['Ayse', 200]);
      await workbook.xlsx.writeFile(filePath);

      const parsed = await service.parse(filePath, 'XLSX');
      expect(parsed.headers).toEqual(['Ad', 'Tutar']);

      const rows = await collect(parsed.rows);
      expect(rows).toEqual([
        ['Ahmet', '100'],
        ['Ayse', '200'],
      ]);
    });
  });
});
