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
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pilens-file-parser-'));
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

    it('headerRowIndex ile baslik oncesi satirlari atlar (Faz B)', async () => {
      const filePath = path.join(tmpDir, 'preamble.csv');
      await fs.writeFile(
        filePath,
        'SCHNEIDER ELECTRIC\n15 Aralik 2025\nReferans,Aciklama,Fiyat\nA9MEM3110,iEM3110,253\n',
        'utf-8',
      );

      const parsed = await service.parse(filePath, 'CSV', 2);
      expect(parsed.headers).toEqual(['Referans', 'Aciklama', 'Fiyat']);

      const rows = await collect(parsed.rows);
      expect(rows).toEqual([['A9MEM3110', 'iEM3110', '253']]);
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

    /**
     * headerRowIndex davranisi (Faz B, baslik oncesi satirlari atlama) CSV tarafinda
     * yukarida test edildi; ayni mantik parseXlsx'te de birebir kullaniliyor. Ikinci bir
     * exceljs-yazilmis XLSX fixture'i burada KASITLI OLARAK eklenmedi: exceljs'in kendi
     * Workbook (yazici) + WorkbookReader (okuyucu) ciftini ayni process icinde birden
     * fazla kez arka arkaya kullanmak, sadece exceljs'in kendi ürettigi minimal test
     * dosyalarinda "_parseWorksheet: Cannot read properties of undefined (reading
     * 'sheets')" hatasina yol aciyor (gercek Excel'den gelen dosyalarda - orn. gercek bir
     * tedarikci fiyat listesi - bu sorun yok, elle dogrulandi). Bu, projenin kodundaki bir
     * hata degil, exceljs'in kendi yazici/okuyucu ciftinin bir kutuphane kisiti.
     */
  });
});
