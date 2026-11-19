import * as ExcelJS from 'exceljs';
import { z } from 'zod';
import { formatImportZodIssues } from '../../core/validators/import-row-errors';
import { parseImportNumber } from '../product-imports/number-format';
import type { QuoteItemImportRowError } from './quote-item-import.format';

/**
 * `/teklifler/yeni` "Ürün Listesi" kartindaki GRUPLU Excel ice aktarma akisinin SABIT
 * dosya formati (bkz. docs/VARSAYIMLAR.md V86). Grupsuz formatin (quote-item-import.
 * format.ts) aksine burada fiyat/para birimi/iskonto/KDV sutunu YOK - kullanici grup
 * fiyatini teklif formunda elle girer. Urun satirlarinin arasindaki "grup satirlari"
 * (orn. A:E birlestirilmis "AT-ZK-1 PANOSU") altlarindaki urunlerin grup adidir.
 *
 * Grup satiri kurali: Miktar hucresi bos ya da sayi degil VE satirdaki dolu hucrelerin
 * hepsi ayni metin (birlestirilmis hucrelerde Excel degeri her hucreye ya da sadece ilk
 * hucreye yazabilir - ikisi de desteklenir). Ilk grup satirindan once gelen urun
 * satirlari hata sayilir (urunler bir gruba ait olmali).
 */
export const QUOTE_GROUPED_ITEM_IMPORT_COLUMNS = [
  { key: 'sku', header: 'ÜRÜN KODU', width: 22 },
  { key: 'name', header: 'MALZEME ADI/AÇIKLAMASI', width: 70 },
  { key: 'brand', header: 'MARKA', width: 16 },
  { key: 'quantity', header: 'MİKTAR', width: 10 },
  { key: 'unit', header: 'BİRİM', width: 10 },
] as const;

const QUANTITY_INDEX = QUOTE_GROUPED_ITEM_IMPORT_COLUMNS.findIndex(
  (column) => column.key === 'quantity',
);

const FIELD_LABELS: Record<string, string> = Object.fromEntries(
  QUOTE_GROUPED_ITEM_IMPORT_COLUMNS.map((c) => [c.key, c.header]),
);

const TEMPLATE_ROWS: { group: string; items: (string | number)[][] }[] = [
  {
    group: 'ÖRNEK GRUP 1 (ör. AT-ZK-1 PANOSU)',
    items: [
      ['ABC-001', 'Örnek Ürün 1 - açıklama', 'Örnek Marka', 2, 'ADET'],
      ['ABC-002', 'Örnek Ürün 2 - açıklama', 'Örnek Marka', 10, 'ADET'],
    ],
  },
  {
    group: 'ÖRNEK GRUP 2',
    items: [['XYZ-100', 'Örnek Ürün 3 - açıklama', 'Diğer Marka', 1, 'ADET']],
  },
];

const HEADER_FILL = 'FF1F4E78';
const GROUP_FILL = 'FFD9E1F2';

function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s+/g, ' ');
}

export function validateQuoteGroupedItemImportHeaders(
  headers: string[],
): string | null {
  const actual = headers.map(normalizeHeader);
  while (actual.length > 0 && actual[actual.length - 1] === '') {
    actual.pop();
  }
  const expected = QUOTE_GROUPED_ITEM_IMPORT_COLUMNS.map((c) =>
    normalizeHeader(c.header),
  );
  const matches =
    actual.length === expected.length &&
    expected.every((header, index) => actual[index] === header);
  if (matches) {
    return null;
  }
  const expectedLabel = QUOTE_GROUPED_ITEM_IMPORT_COLUMNS.map(
    (c) => c.header,
  ).join(', ');
  return `Dosya gruplu örnek şablonla aynı formatta değil. İlk satırda sırasıyla şu başlıklar olmalı: ${expectedLabel}. Lütfen gruplu örnek Excel'i indirip ürünlerinizi o dosyaya girin.`;
}

const GroupedRowSchema = z.object({
  sku: z.string().trim().max(100).optional(),
  name: z.string().trim().min(2).max(300),
  brand: z.string().trim().max(100).optional(),
  quantity: z.number().gt(0),
  unit: z.string().trim().max(50).optional(),
});
export type QuoteGroupedItemImportRow = z.infer<typeof GroupedRowSchema>;

/** Satir bir grup basligiysa grup adini, degilse null doner. */
export function detectGroupRow(cells: string[]): string | null {
  const values = cells.map((cell) => (cell ?? '').trim());
  const quantityRaw = values[QUANTITY_INDEX] ?? '';
  const quantity = quantityRaw
    ? parseImportNumber(quantityRaw, 'tr')
    : undefined;
  if (quantity !== undefined) return null;
  const distinct = new Set(values.filter((value) => value !== ''));
  if (distinct.size !== 1) return null;
  return [...distinct][0];
}

export type ParsedGroupedLine =
  | { kind: 'group'; name: string }
  | { kind: 'item'; row: QuoteGroupedItemImportRow }
  | { kind: 'error'; messages: string[] };

/** Tek bir dosya satirini grup/urun/hata olarak siniflandirir. */
export function parseGroupedImportLine(cells: string[]): ParsedGroupedLine {
  const groupName = detectGroupRow(cells);
  if (groupName !== null) {
    return { kind: 'group', name: groupName.slice(0, 200) };
  }
  const data: Record<string, unknown> = {};
  const messages: string[] = [];
  QUOTE_GROUPED_ITEM_IMPORT_COLUMNS.forEach((column, index) => {
    const raw = (cells[index] ?? '').trim();
    if (!raw) return;
    if (column.key === 'quantity') {
      const value = parseImportNumber(raw, 'tr');
      if (value === undefined) {
        messages.push(`${column.header} sayı olmalıdır ("${raw}" okunamadı).`);
      } else {
        data.quantity = value;
      }
    } else {
      data[column.key] = raw;
    }
  });
  const result = GroupedRowSchema.safeParse(data);
  if (!result.success) {
    messages.push(...formatImportZodIssues(result.error.issues, FIELD_LABELS));
  }
  if (messages.length > 0 || !result.success) {
    return { kind: 'error', messages };
  }
  return { kind: 'item', row: result.data };
}

export interface CollectedGroupedRow {
  row: QuoteGroupedItemImportRow;
  groupName: string;
  fileRow: number;
}

/** Dosyanin (baslik sonrasi) tum satirlarini dolasip grup adlariyla eslenmis urun
 * satirlarini ve satir hatalarini toplar. */
export async function collectGroupedImportRows(
  rows: AsyncIterable<string[]>,
): Promise<{
  items: CollectedGroupedRow[];
  errors: QuoteItemImportRowError[];
}> {
  const items: CollectedGroupedRow[] = [];
  const errors: QuoteItemImportRowError[] = [];
  let currentGroup: string | null = null;
  let index = 0;
  for await (const cells of rows) {
    const fileRow = index + 2;
    index++;
    if (cells.every((cell) => !cell?.trim())) continue;
    const parsed = parseGroupedImportLine(cells);
    if (parsed.kind === 'group') {
      currentGroup = parsed.name;
    } else if (parsed.kind === 'error') {
      errors.push({ row: fileRow, messages: parsed.messages });
    } else if (currentGroup === null) {
      errors.push({
        row: fileRow,
        messages: [
          'Ürün satırı bir grup satırının altında olmalıdır. İlk ürünün üstüne grup adını içeren bir satır ekleyin.',
        ],
      });
    } else {
      items.push({ row: parsed.row, groupName: currentGroup, fileRow });
    }
  }
  return { items, errors };
}

export async function buildQuoteGroupedItemImportTemplate(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Ürün Listesi');
  worksheet.columns = QUOTE_GROUPED_ITEM_IMPORT_COLUMNS.map((column) => ({
    header: column.header,
    key: column.key,
    width: column.width,
  }));
  const header = worksheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: HEADER_FILL },
    };
  });
  const lastColumn = String.fromCharCode(
    64 + QUOTE_GROUPED_ITEM_IMPORT_COLUMNS.length,
  );
  for (const block of TEMPLATE_ROWS) {
    const groupRow = worksheet.addRow([block.group]);
    worksheet.mergeCells(`A${groupRow.number}:${lastColumn}${groupRow.number}`);
    const groupCell = groupRow.getCell(1);
    groupCell.font = { bold: true };
    groupCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: GROUP_FILL },
    };
    worksheet.addRows(block.items);
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
