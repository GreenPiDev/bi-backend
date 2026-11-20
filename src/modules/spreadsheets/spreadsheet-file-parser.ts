import { HttpStatus } from '@nestjs/common';
import type { DataSourceType } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import * as fsPromises from 'node:fs/promises';
import Papa from 'papaparse';
import { AppException } from '../../core/errors/app.exception';
import {
  excelSerialToDate,
  isDateNumFmt,
} from '../datasources/file-parser.service';
import {
  MAX_COL_WIDTH,
  MAX_COLS_PER_SHEET,
  MAX_ROWS_PER_SHEET,
  MIN_COL_WIDTH,
  MAX_TOTAL_CELLS,
} from './spreadsheets.constants';

export interface ParsedCell {
  row: number;
  col: number;
  value: string | null;
  bgColor: string | null;
  fontColor: string | null;
}

export interface ParsedSheet {
  name: string;
  rowCount: number;
  colCount: number;
  /** Excel'de elle ayarlanmis sutun genislikleri (px). */
  colWidths: Record<string, number>;
  cells: ParsedCell[];
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Excel'deki tarih hucreleri ekranda TR bicimiyle (gg.AA.yyyy[ ss:dd]) gorunsun diye
 * ISO yerine duz metne cevrilir - e-tablo hucresi sonradan zaten serbest metin olarak
 * duzenleniyor. exceljs tarihleri UTC olarak verdigi icin UTC bilesenleri kullanilir. */
function formatDate(date: Date): string {
  const base = `${pad2(date.getUTCDate())}.${pad2(date.getUTCMonth() + 1)}.${date.getUTCFullYear()}`;
  const hasTime =
    date.getUTCHours() !== 0 ||
    date.getUTCMinutes() !== 0 ||
    date.getUTCSeconds() !== 0;
  return hasTime
    ? `${base} ${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}`
    : base;
}

/** XLSX'teki kayan nokta gurultusunu (orn. 0.1+0.2 -> 0.30000000000000004) temizler,
 * bkz. docs/VARSAYIMLAR.md V40'taki ayni sinif hata. */
function formatNumber(value: number): string {
  return String(Number(value.toPrecision(15)));
}

export function cellValueToDisplay(
  value: ExcelJS.CellValue,
  numFmt?: string,
): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return formatDate(value);
  if (typeof value === 'number') {
    return isDateNumFmt(numFmt)
      ? formatDate(excelSerialToDate(value))
      : formatNumber(value);
  }
  if (typeof value === 'boolean') return value ? 'DOĞRU' : 'YANLIŞ';
  if (typeof value === 'object') {
    if ('result' in value) {
      return cellValueToDisplay(
        (value as { result: ExcelJS.CellValue }).result,
        numFmt,
      );
    }
    if ('richText' in value) {
      return (value as { richText: { text: string }[] }).richText
        .map((part) => part.text)
        .join('');
    }
    if ('text' in value) return String((value as { text: unknown }).text);
    return '';
  }
  return String(value);
}

/** exceljs ARGB ('FFRRGGBB') -> '#RRGGBB'. Tema/indeksli renkler (argb'siz) cozulemez,
 * null doner (bkz. docs/VARSAYIMLAR.md V88). */
export function argbToHex(
  color: Partial<ExcelJS.Color> | undefined,
): string | null {
  const argb = color?.argb;
  if (typeof argb !== 'string' || !/^[0-9A-Fa-f]{8}$/.test(argb)) return null;
  return `#${argb.slice(2).toUpperCase()}`;
}

function cellBgColor(cell: ExcelJS.Cell): string | null {
  const fill = cell.fill;
  if (!fill || fill.type !== 'pattern' || fill.pattern !== 'solid') return null;
  return argbToHex(fill.fgColor);
}

function limitExceededError(): AppException {
  return new AppException(
    'SPREADSHEET_TOO_LARGE',
    `Dosya cok buyuk. Sayfa basina en fazla ${MAX_ROWS_PER_SHEET} satir ve ${MAX_COLS_PER_SHEET} sutun desteklenir.`,
    HttpStatus.BAD_REQUEST,
  );
}

function emptyFileError(): AppException {
  return new AppException(
    'EMPTY_FILE',
    'Dosyada veri bulunamadi.',
    HttpStatus.BAD_REQUEST,
  );
}

/** Excel sutun genisligi karakter birimindedir (varsayilan font'ta '0' genisligi);
 * yaklasik piksel karsiligi: genislik * 7 + 5. */
function readColWidths(
  worksheet: ExcelJS.Worksheet,
  colCount: number,
): Record<string, number> {
  const widths: Record<string, number> = {};
  for (let col = 1; col <= colCount; col++) {
    const chars = worksheet.getColumn(col).width;
    if (typeof chars !== 'number' || !Number.isFinite(chars) || chars <= 0)
      continue;
    const px = Math.round(chars * 7 + 5);
    widths[String(col - 1)] = Math.min(
      MAX_COL_WIDTH,
      Math.max(MIN_COL_WIDTH, px),
    );
  }
  return widths;
}

function readWorksheet(worksheet: ExcelJS.Worksheet): ParsedSheet {
  const cells: ParsedCell[] = [];
  let rowCount = 0;
  let colCount = 0;
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber > MAX_ROWS_PER_SHEET) throw limitExceededError();
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      if (colNumber > MAX_COLS_PER_SHEET) throw limitExceededError();
      // Birlestirilmis hucrelerde deger sadece ana (sol-ust) hucrede tutulur.
      if (cell.isMerged && cell.master.address !== cell.address) return;
      const value = cellValueToDisplay(cell.value, cell.numFmt);
      const bgColor = cellBgColor(cell);
      const fontColor = argbToHex(cell.font?.color);
      if (!value && !bgColor && !fontColor) return;
      cells.push({
        row: rowNumber - 1,
        col: colNumber - 1,
        value: value || null,
        bgColor,
        fontColor,
      });
      rowCount = Math.max(rowCount, rowNumber);
      colCount = Math.max(colCount, colNumber);
    });
  });
  return {
    name: worksheet.name,
    rowCount,
    colCount,
    colWidths: readColWidths(worksheet, colCount),
    cells,
  };
}

/**
 * exceljs'in buffered Workbook API'si kullaniliyor (streaming degil): e-tablo yuklemesi
 * 10 MB ile sinirli oldugu icin bellek sorun degil, ve buffered API hem stilleri (renk)
 * okuyor hem de file-parser.service.ts'te belgelenen streaming race'inden bagisik.
 */
async function parseXlsx(filePath: string): Promise<ParsedSheet[]> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.readFile(filePath);
  } catch {
    throw new AppException(
      'XLSX_PARSE_FAILED',
      'Dosya okunamadi, lutfen gecerli bir Excel dosyasi yukleyin.',
      HttpStatus.BAD_REQUEST,
    );
  }
  return workbook.worksheets.map(readWorksheet);
}

async function parseCsv(filePath: string): Promise<ParsedSheet[]> {
  const content = await fsPromises.readFile(filePath, 'utf-8');
  const parsed = Papa.parse<string[]>(content.replace(/^﻿/, ''), {
    skipEmptyLines: false,
  });
  const rows = parsed.data;
  if (rows.length > MAX_ROWS_PER_SHEET) throw limitExceededError();
  const cells: ParsedCell[] = [];
  let rowCount = 0;
  let colCount = 0;
  rows.forEach((row, rowIndex) => {
    if (row.length > MAX_COLS_PER_SHEET) throw limitExceededError();
    row.forEach((raw, colIndex) => {
      const value = (raw ?? '').trim();
      if (!value) return;
      cells.push({
        row: rowIndex,
        col: colIndex,
        value,
        bgColor: null,
        fontColor: null,
      });
      rowCount = Math.max(rowCount, rowIndex + 1);
      colCount = Math.max(colCount, colIndex + 1);
    });
  });
  return [{ name: 'Sayfa1', rowCount, colCount, colWidths: {}, cells }];
}

export async function parseSpreadsheetFile(
  filePath: string,
  type: DataSourceType,
): Promise<ParsedSheet[]> {
  const sheets =
    type === 'CSV' ? await parseCsv(filePath) : await parseXlsx(filePath);
  const totalCells = sheets.reduce((sum, s) => sum + s.cells.length, 0);
  if (totalCells === 0) throw emptyFileError();
  if (totalCells > MAX_TOTAL_CELLS) {
    throw new AppException(
      'SPREADSHEET_TOO_LARGE',
      `Dosya cok buyuk. Toplamda en fazla ${MAX_TOTAL_CELLS} dolu hucre desteklenir.`,
      HttpStatus.BAD_REQUEST,
    );
  }
  return sheets;
}

/** 0-based sutun indeksi -> Excel harfi (0 -> A, 26 -> AA). */
export function columnLetter(col: number): string {
  let n = col + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

export function cellAddress(row: number, col: number): string {
  return `${columnLetter(col)}${row + 1}`;
}
