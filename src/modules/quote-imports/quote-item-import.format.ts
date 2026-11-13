import * as ExcelJS from 'exceljs';
import { z } from 'zod';
import {
  normalizeCurrency,
  parseImportNumber,
} from '../product-imports/number-format';
import { slugify } from '../tenants/slugify';

/**
 * `/teklifler/yeni` "Ürün Listesi" kartindaki "Excel'den Içe Aktar" akisinin SABIT
 * dosya formati. Diger ice aktarmalarin (product-imports, quote-imports) aksine burada
 * baslik satiri secimi / sutun esleme YOK - kullanici bizim sablonumuza uymak zorunda
 * (kullanici talebi: "burada rigid olacagiz"). Baslik satiri her zaman 1. satirdir ve
 * basliklar bu listedeki sirayla birebir ayni olmalidir (bas/son bosluk ve buyuk/kucuk
 * harf farki yok sayilir). Bkz. docs/VARSAYIMLAR.md V83.
 *
 * bi-frontend'de ayni liste yoktur - sablon backend'den indirilir (GET
 * /quote-imports/items/template), tek kaynak burasi.
 */
export const QUOTE_ITEM_IMPORT_COLUMNS = [
  { key: 'sku', header: 'Ürün Kodu', width: 18 },
  { key: 'name', header: 'Ürün Adı', width: 40 },
  { key: 'brand', header: 'Marka', width: 16 },
  { key: 'quantity', header: 'Miktar', width: 10 },
  { key: 'unit', header: 'Birim', width: 10 },
  { key: 'unitPrice', header: 'Birim Fiyat', width: 14 },
  { key: 'currency', header: 'Para Birimi', width: 12 },
  { key: 'discountPct', header: 'İskonto %', width: 11 },
  { key: 'vatPct', header: 'KDV %', width: 9 },
] as const;

export type QuoteItemImportColumnKey =
  (typeof QUOTE_ITEM_IMPORT_COLUMNS)[number]['key'];

const TEMPLATE_EXAMPLE_ROWS: (string | number)[][] = [
  ['ABC-001', 'Örnek Ürün 1', 'Örnek Marka', 2, 'adet', 1250.5, 'TRY', 0, 20],
  ['', 'Örnek Ürün 2 (kodsuz)', '', 10, 'metre', 45, 'USD', 5, 20],
];

/** Satir hatalarinda kullaniciya gosterilen alan adlari - basliklarla ayni. */
export const QUOTE_ITEM_IMPORT_FIELD_LABELS: Record<string, string> =
  Object.fromEntries(QUOTE_ITEM_IMPORT_COLUMNS.map((c) => [c.key, c.header]));

function normalizeHeader(header: string): string {
  return header.trim().toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ');
}

/** Dosyanin baslik satiri sablonla birebir uyusmuyorsa, kullaniciya gosterilecek
 * Turkce hata mesajini doner; uyusuyorsa null. */
export function validateQuoteItemImportHeaders(
  headers: string[],
): string | null {
  const actual = headers.map(normalizeHeader);
  // Sondaki tamamen bos baslik hucreleri (Excel'in bicimlendirilmis bos kolonlari) yok sayilir.
  while (actual.length > 0 && actual[actual.length - 1] === '') {
    actual.pop();
  }
  const expected = QUOTE_ITEM_IMPORT_COLUMNS.map((c) =>
    normalizeHeader(c.header),
  );
  const matches =
    actual.length === expected.length &&
    expected.every((header, index) => actual[index] === header);
  if (matches) {
    return null;
  }
  const expectedLabel = QUOTE_ITEM_IMPORT_COLUMNS.map((c) => c.header).join(
    ', ',
  );
  return `Dosya örnek şablonla aynı formatta değil. İlk satırda sırasıyla şu başlıklar olmalı: ${expectedLabel}. Lütfen örnek Excel'i indirip ürünlerinizi o dosyaya girin.`;
}

/** Hata mesajlari burada verilmez - formatImportZodIssues her Zod hata kodu icin
 * QUOTE_ITEM_IMPORT_FIELD_LABELS'taki Turkce baslikla kendi cumlesini kurar. */
export const QuoteItemImportRowSchema = z.object({
  sku: z.string().trim().max(100).optional(),
  name: z.string().trim().min(2).max(300),
  brand: z.string().trim().max(100).optional(),
  quantity: z.number().gt(0),
  unit: z.string().trim().max(50).optional(),
  unitPrice: z.number().min(0).max(999_999_999_999.99),
  currency: z
    .string()
    .trim()
    .regex(
      /^[A-Z]{3}$/,
      'Para Birimi 3 harfli bir kod olmalıdır (TRY, USD, EUR...).',
    )
    .default('TRY'),
  discountPct: z.number().min(0).max(100).default(0),
  vatPct: z.number().min(0).max(100).optional(),
});
export type QuoteItemImportRow = z.infer<typeof QuoteItemImportRowSchema>;

const NUMERIC_KEYS: QuoteItemImportColumnKey[] = [
  'quantity',
  'unitPrice',
  'discountPct',
  'vatPct',
];

export interface MappedQuoteItemImportCells {
  data: Record<string, unknown>;
  /** Sayi olarak okunamayan dolu hucreler - Zod'a hic verilmeden burada raporlanir. */
  errors: string[];
}

/** Ham hucre degerlerini (dosyadaki sirayla) Zod'a verilecek nesneye cevirir. Sayilar
 * TR formatinda ("1.234,56") ya da Excel'in sayisal hucre formatinda ("1234.56")
 * olabilir - parseImportNumber ikisini de okur (bkz. number-format.ts). */
export function mapQuoteItemImportCells(
  cells: string[],
): MappedQuoteItemImportCells {
  const data: Record<string, unknown> = {};
  const errors: string[] = [];
  QUOTE_ITEM_IMPORT_COLUMNS.forEach((column, index) => {
    const raw = (cells[index] ?? '').trim();
    if (!raw) {
      return;
    }
    if (NUMERIC_KEYS.includes(column.key)) {
      const value = parseImportNumber(raw.replace(/%/g, '').trim(), 'tr');
      if (value === undefined) {
        errors.push(`${column.header} sayı olmalıdır ("${raw}" okunamadı).`);
      } else {
        data[column.key] = value;
      }
    } else if (column.key === 'currency') {
      data[column.key] = normalizeCurrency(raw);
    } else {
      data[column.key] = raw;
    }
  });
  return { data, errors };
}

export async function buildQuoteItemImportTemplate(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Teklif Kalemleri');
  worksheet.columns = QUOTE_ITEM_IMPORT_COLUMNS.map((column) => ({
    header: column.header,
    key: column.key,
    width: column.width,
  }));
  worksheet.getRow(1).font = { bold: true };
  worksheet.addRows(TEMPLATE_EXAMPLE_ROWS);
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/** Multer, multipart'taki UTF-8 dosya adini latin1 olarak cozer ("TeklÄ±f.xlsx") -
 * butun karakterler tek bayt araligindaysa UTF-8 olarak yeniden yorumlanir. */
export function decodeUploadedFileName(name: string): string {
  if (![...name].every((char) => char.charCodeAt(0) <= 0xff)) {
    return name;
  }
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  return decoded.includes('�') ? name : decoded;
}

/** "Teklif Listesi.xlsx" + yukleme ani -> "teklif-listesi-2026-11-13-1430"
 * (Europe/Istanbul saatiyle). Kullanici talebi: yeni liste "excel dosyasinin ismi ve
 * upload tarihi ile sluglanarak" adlandirilir. */
export function buildImportedProductListName(
  fileName: string,
  now: Date,
): string {
  const baseName = decodeUploadedFileName(fileName).replace(/\.[^.]+$/, '');
  const slug = slugify(baseName) || 'teklif-excel';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${slug}-${get('year')}-${get('month')}-${get('day')}-${get('hour')}${get('minute')}`;
}

/** Teklif formuna dogrudan eklenecek satir - bi-frontend'deki QuoteLineItemValues'a
 * karsilik gelir (string degil sayi; frontend string'e cevirir). */
export interface QuoteItemImportLine {
  productId: string;
  /** Urunun ait oldugu liste - frontend henuz liste secilmemisse bunu secer. */
  productListId: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  currency: string;
  discountPct: number;
  /** Dosyada bos birakildiysa null - frontend tenant varsayilan KDV'sini uygular. */
  vatPct: number | null;
  brand: string | null;
}

export interface QuoteItemImportResult {
  items: QuoteItemImportLine[];
  /** Sistemde bulunamayan urunler icin olusturulan yeni urun listesi - hepsi
   * eslestiyse null. */
  productList: { id: string; name: string } | null;
  matchedCount: number;
  createdProductCount: number;
}

export interface QuoteItemImportRowError {
  row: number;
  messages: string[];
}
