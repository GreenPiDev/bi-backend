import { HttpStatus, Injectable } from '@nestjs/common';
import type { DataSourceType } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import * as fs from 'node:fs';
import * as readline from 'node:readline';
import Papa from 'papaparse';
import { AppException } from '../../core/errors/app.exception';
import { AsyncRowQueue } from './async-row-queue';

export interface ParsedFile {
  headers: string[];
  rows: AsyncIterable<string[]>;
}

function emptyFileError(): AppException {
  return new AppException(
    'EMPTY_FILE',
    'Dosyada veri bulunamadi.',
    HttpStatus.BAD_REQUEST,
  );
}

function cellValueToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'object') {
    if ('result' in value) {
      return cellValueToString((value as { result: ExcelJS.CellValue }).result);
    }
    if ('text' in value) {
      return String((value as { text: unknown }).text);
    }
    if ('richText' in value) {
      return (value as { richText: { text: string }[] }).richText
        .map((part) => part.text)
        .join('');
    }
    return '';
  }
  return String(value);
}

function rowValuesToStrings(
  values: ExcelJS.CellValue[],
  length: number,
): string[] {
  const out: string[] = [];
  for (let i = 1; i <= length; i++) {
    out.push(cellValueToString(values[i]).trim());
  }
  return out;
}

@Injectable()
export class FileParserService {
  /**
   * headerRowIndex: 0-based, kac satirin baslik oncesi atlanacagini belirtir
   * (0 = ilk satir baslik, varsayilan davranis). Faz B'de marka fiyat listesi
   * export'larinda baslik satiri ilk satirda olmayabiliyor (orn. Schneider'da
   * satir 3) - kullanici ice aktarma onizlemesinde bu satiri secer.
   */
  async parse(
    filePath: string,
    type: DataSourceType,
    headerRowIndex = 0,
  ): Promise<ParsedFile> {
    return type === 'CSV'
      ? this.parseCsv(filePath, headerRowIndex)
      : this.parseXlsx(filePath, headerRowIndex);
  }

  private async parseCsv(
    filePath: string,
    headerRowIndex: number,
  ): Promise<ParsedFile> {
    const headers = await this.readCsvHeaders(filePath, headerRowIndex);
    return { headers, rows: this.streamCsvRows(filePath, headerRowIndex) };
  }

  private async readCsvHeaders(
    filePath: string,
    headerRowIndex: number,
  ): Promise<string[]> {
    const input = fs.createReadStream(filePath, { encoding: 'utf-8' });
    const rl = readline.createInterface({ input, crlfDelay: Infinity });
    try {
      let lineIndex = 0;
      for await (const line of rl) {
        if (lineIndex < headerRowIndex) {
          lineIndex++;
          continue;
        }
        const parsed = Papa.parse<string[]>(line);
        const headers = (parsed.data[0] ?? []) as string[];
        return headers.map((h) => h.trim());
      }
      throw emptyFileError();
    } finally {
      rl.close();
      input.destroy();
    }
  }

  private streamCsvRows(
    filePath: string,
    headerRowIndex: number,
  ): AsyncIterable<string[]> {
    const queue = new AsyncRowQueue<string[]>();
    const input = fs.createReadStream(filePath, { encoding: 'utf-8' });
    const headerLineNumber = headerRowIndex + 1;
    let rowIndex = 0;
    Papa.parse<string[]>(input, {
      skipEmptyLines: true,
      step: (result, parser) => {
        rowIndex++;
        if (rowIndex <= headerLineNumber) {
          return;
        }
        const row = (result.data ?? []).map((v) => (v ?? '').trim());
        queue.push(row);
        queue.onPause(() => parser.pause());
        queue.onResume(() => parser.resume());
      },
      complete: () => queue.end(),
      error: (err: Error) => queue.fail(err),
    });
    return queue;
  }

  /**
   * A single read pass (rather than a header peek followed by a second
   * streamed pass) — exceljs's WorkbookReader does not support reliably
   * re-opening the same file for a second pass immediately after the
   * first, which caused intermittent empty reads in testing.
   */
  private async parseXlsx(
    filePath: string,
    headerRowIndex: number,
  ): Promise<ParsedFile> {
    const reader = new ExcelJS.stream.xlsx.WorkbookReader(filePath, {});
    const headerLineNumber = headerRowIndex + 1;
    let headers: string[] | null = null;
    const rows: string[][] = [];
    for await (const worksheet of reader) {
      let rowIndex = 0;
      for await (const row of worksheet) {
        rowIndex++;
        if (rowIndex < headerLineNumber) {
          continue;
        }
        const values = row.values as ExcelJS.CellValue[];
        if (rowIndex === headerLineNumber) {
          headers = rowValuesToStrings(values, values.length - 1);
          continue;
        }
        /**
         * Satirin KENDI genisligini kullan, baslik satirinin genisligini degil - baslik
         * satiri (orn. tek hucreli bir marka basligi) veri satirlarindan dar olabilir,
         * headers.length kullanmak veri satirlarini yanlislikla kirpardi (bkz.
         * docs/VARSAYIMLAR.md V40, gercek Schneider dosyasinda bulunan regresyon).
         */
        rows.push(rowValuesToStrings(values, values.length - 1));
      }
      break;
    }
    if (!headers) {
      throw emptyFileError();
    }
    return { headers, rows: arrayToAsyncIterable(rows) };
  }
}

async function* arrayToAsyncIterable<T>(items: T[]): AsyncGenerator<T> {
  for (const item of items) {
    yield item;
  }
}
