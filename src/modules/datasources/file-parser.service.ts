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

/** exceljs'in kendi utils.isDateFmt'iyle ayni desen (bkz. node_modules/exceljs/lib/
 * utils/utils.js) - tirnak/koseli parantez icini atip kalan karakterlerde tarih
 * bicimi harflerini arar. */
function isDateNumFmt(fmt: string | undefined): boolean {
  if (!fmt) {
    return false;
  }
  const cleaned = fmt.replace(/\[[^\]]*]/g, '').replace(/"[^"]*"/g, '');
  return /[ymdhMsb]+/.test(cleaned);
}

/** exceljs'in kendi utils.excelToDate'iyle ayni formul (1900 tarih sistemi) -
 * exceljs bu fonksiyonu disariya acmiyor, kucuk oldugu icin burada tekrarlaniyor. */
function excelSerialToDate(serial: number): Date {
  return new Date(Math.round((serial - 25569) * 24 * 3600 * 1000));
}

/**
 * exceljs'in streaming WorkbookReader'i formul hucrelerinde (orn. baska bir
 * hucreye referans veren tarih kolonu) numFmt tarih olsa bile sonucu Date'e
 * cevirmiyor, ham Excel seri numarasini ("46210.44...") birakiyor (bkz.
 * node_modules/exceljs/lib/stream/xlsx/worksheet-reader.js - c.f dalinda isDateFmt
 * kontrolu yok). numFmt burada elle kontrol edilip bu durum telafi ediliyor.
 */
function cellValueToString(value: ExcelJS.CellValue, numFmt?: string): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'number' && isDateNumFmt(numFmt)) {
    return excelSerialToDate(value).toISOString();
  }
  if (typeof value === 'object') {
    if ('result' in value) {
      return cellValueToString(
        (value as { result: ExcelJS.CellValue }).result,
        numFmt,
      );
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

function rowToStrings(row: ExcelJS.Row, length: number): string[] {
  const out: string[] = [];
  for (let i = 1; i <= length; i++) {
    const cell = row.getCell(i);
    out.push(cellValueToString(cell.value, cell.numFmt).trim());
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
   *
   * Once-measured failure rate of the streaming reader for a small (~20
   * satir) dosyada SIKI dongude ~%90'a kadar cikiyordu (bkz. asagidaki
   * isExceljsWorkbookReaderRaceError yorumu) - buyuk BI dataset'lerinde
   * (100k satir) ise 0/15 - demek ki risk esasen kucuk/orta boy ice aktarma
   * dosyalarinda (accounts/contacts/interactions/products) yogunlasiyor.
   * Bu yuzden once birkac kez hizli/dusuk-bellekli streaming reader denenir
   * (buyuk dosyalarda zaten ilk denemede basarili olur), basarisiz olursa
   * exceljs'in sirayla-bagimsiz (yani bu race'e kapali) buffered
   * `Workbook().xlsx.readFile()` API'sine dusulur - bu dal 300+ tekrarlı
   * torture testinde hic basarisiz olmadi, sadece buyuk dosyalarda daha
   * fazla bellek/zaman kullaniyor (bkz. docs/YOL_HARITASI.md ilgili kayit).
   */
  private async parseXlsx(
    filePath: string,
    headerRowIndex: number,
  ): Promise<ParsedFile> {
    let lastError: unknown;
    for (let attempt = 0; attempt < XLSX_STREAMING_RETRY_COUNT; attempt++) {
      try {
        const result = await this.readXlsxStreaming(filePath, headerRowIndex);
        if (!isSuspiciouslyEmptyResult(result)) {
          return toParsedFile(result);
        }
        lastError = undefined;
      } catch (error) {
        if (!isExceljsWorkbookReaderRaceError(error)) {
          throw error;
        }
        lastError = error;
      }
    }
    try {
      return toParsedFile(
        await this.readXlsxBuffered(filePath, headerRowIndex),
      );
    } catch {
      if (lastError) {
        throw lastError;
      }
      throw new AppException(
        'XLSX_PARSE_FAILED',
        'Dosya okunamadi, lutfen tekrar deneyin.',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * exceljs'in standart (streaming olmayan) Workbook API'si - tum zip'i
   * acip rastgele erisimle parse ediyor, bu yuzden entry sirasina bagli
   * degil ve yukaridaki race'den tamamen bagisik. Buyuk dosyalarda
   * streaming'den daha yavas/bellek-yogun oldugu icin yalnizca streaming
   * basarisiz olunca (hata firlatarak ya da asagidaki isSuspiciouslyEmptyResult
   * ile sessizce) devreye giriyor.
   */
  private async readXlsxBuffered(
    filePath: string,
    headerRowIndex: number,
  ): Promise<RawXlsxResult> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      throw emptyFileError();
    }
    const headerLineNumber = headerRowIndex + 1;
    let headers: string[] | null = null;
    const rows: string[][] = [];
    worksheet.eachRow((row, rowIndex) => {
      const values = row.values as ExcelJS.CellValue[];
      if (rowIndex < headerLineNumber) {
        return;
      }
      if (rowIndex === headerLineNumber) {
        headers = rowToStrings(row, values.length - 1);
        return;
      }
      rows.push(rowToStrings(row, values.length - 1));
    });
    if (!headers) {
      throw emptyFileError();
    }
    return { headers, rows };
  }

  private async readXlsxStreaming(
    filePath: string,
    headerRowIndex: number,
  ): Promise<RawXlsxResult> {
    /**
     * styles: 'cache' olmadan exceljs styles.xml'i hic okumaz (varsayilan 'ignore') -
     * bu durumda hicbir hucrenin numFmt'i cozulemez ve Excel'de gercek tarih olarak
     * saklanan (sayisal seri + tarih bicimi) her hucre ham seri numara ("46210.44...")
     * olarak gelir; sadece exceljs'in kendi Date/tarih tanimasi degil, asagidaki
     * isDateNumFmt/excelSerialToDate telafisi de bu secenege bagli. Bkz.
     * node_modules/exceljs/lib/stream/xlsx/workbook-reader.js (styles varsayilani).
     */
    const reader = new ExcelJS.stream.xlsx.WorkbookReader(filePath, {
      styles: 'cache',
    });
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
          headers = rowToStrings(row, values.length - 1);
          continue;
        }
        /**
         * Satirin KENDI genisligini kullan, baslik satirinin genisligini degil - baslik
         * satiri (orn. tek hucreli bir marka basligi) veri satirlarindan dar olabilir,
         * headers.length kullanmak veri satirlarini yanlislikla kirpardi (bkz.
         * docs/VARSAYIMLAR.md V40, gercek Schneider dosyasinda bulunan regresyon).
         */
        rows.push(rowToStrings(row, values.length - 1));
      }
      break;
    }
    if (!headers) {
      throw emptyFileError();
    }
    return { headers, rows };
  }
}

interface RawXlsxResult {
  headers: string[];
  rows: string[][];
}

function toParsedFile(result: RawXlsxResult): ParsedFile {
  return { headers: result.headers, rows: arrayToAsyncIterable(result.rows) };
}

/**
 * exceljs'in ayni race'i bazen TypeError firlatmadan, sessizce TUM hucreleri
 * bos string olarak donerek de gosterebiliyor (kullanicinin gercek tarayicida
 * bildirdigi "|||||" belirtisi - bkz. docs/YOL_HARITASI.md ilgili kayit).
 * Bu durumda bariz bir hata olmadigindan retry mantigi tetiklenmiyordu; burada
 * sonucun kendisi "suspiciously empty" olup olmadigina bakip streaming
 * denemesini basarisiz sayiyoruz. Baslik satirinin TAMAMEN bos gelmesi (veya
 * tum veri satirlarinin tamamen bos gelmesi) gercek bir dosyada neredeyse hic
 * rastlanmayan bir durum, bu yuzden guvenli bir sinyal.
 */
function isSuspiciouslyEmptyResult(result: RawXlsxResult): boolean {
  const allEmpty = (cells: string[]): boolean =>
    cells.length > 0 && cells.every((cell) => cell === '');
  if (allEmpty(result.headers)) {
    return true;
  }
  return result.rows.length > 0 && result.rows.every((row) => allEmpty(row));
}

/**
 * exceljs'in streaming WorkbookReader'inda bilinen, upstream bir race condition:
 * zip'teki "xl/worksheets/sheet1.xml" girdisi "xl/workbook.xml"'den once gelir (her
 * zaman, dosya icerigiyle degismeyen sabit bir siralama); normalde bu durum
 * WorkbookReader'in "deferred" (temp dosyaya yazip sonra okuma) dalina dusup
 * zararsiz oluyor, ama unzip/zlib'in ic zamanlamasina bagli olarak bazen (ayni
 * dosyada bile, ~4 denemeden 1'inde) "immediate" dala yanlislikla girilip
 * `this.model` henuz set edilmeden `this.model.sheets` okunmaya calisiliyor ve
 * TypeError firliyor (bkz. node_modules/exceljs/lib/stream/xlsx/workbook-reader.js
 * _parseWorksheet). Kullanicinin gercek tarayicida gozlemledigi "ilk denemede hata,
 * tekrar deneyince calisiyor" davranisi buydu. Olcumlerde kucuk dosyalarda bu hata
 * oranı tek basina retry'i guvenilmez kilacak kadar yuksek cikabiliyor (sıkı
 * dongude %90'a varan basarisizlik) - bu yuzden birkac streaming denemesinden sonra
 * readXlsxBuffered()'a (bu race'e kapali) dusuluyor, exceljs'e patch uygulanmiyor.
 */
function isExceljsWorkbookReaderRaceError(error: unknown): boolean {
  return (
    error instanceof TypeError && error.message.includes("reading 'sheets'")
  );
}

const XLSX_STREAMING_RETRY_COUNT = 3;

async function* arrayToAsyncIterable<T>(items: T[]): AsyncGenerator<T> {
  for (const item of items) {
    yield item;
  }
}
