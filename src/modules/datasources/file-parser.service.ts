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
  async parse(filePath: string, type: DataSourceType): Promise<ParsedFile> {
    return type === 'CSV' ? this.parseCsv(filePath) : this.parseXlsx(filePath);
  }

  private async parseCsv(filePath: string): Promise<ParsedFile> {
    const headers = await this.readCsvHeaders(filePath);
    return { headers, rows: this.streamCsvRows(filePath) };
  }

  private async readCsvHeaders(filePath: string): Promise<string[]> {
    const input = fs.createReadStream(filePath, { encoding: 'utf-8' });
    const rl = readline.createInterface({ input, crlfDelay: Infinity });
    try {
      for await (const line of rl) {
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

  private streamCsvRows(filePath: string): AsyncIterable<string[]> {
    const queue = new AsyncRowQueue<string[]>();
    const input = fs.createReadStream(filePath, { encoding: 'utf-8' });
    let rowIndex = 0;
    Papa.parse<string[]>(input, {
      skipEmptyLines: true,
      step: (result, parser) => {
        rowIndex++;
        if (rowIndex === 1) {
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
  private async parseXlsx(filePath: string): Promise<ParsedFile> {
    const reader = new ExcelJS.stream.xlsx.WorkbookReader(filePath, {});
    let headers: string[] | null = null;
    const rows: string[][] = [];
    for await (const worksheet of reader) {
      let rowIndex = 0;
      for await (const row of worksheet) {
        rowIndex++;
        const values = row.values as ExcelJS.CellValue[];
        if (rowIndex === 1) {
          headers = rowValuesToStrings(values, values.length - 1);
          continue;
        }
        rows.push(rowValuesToStrings(values, headers?.length ?? 0));
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
