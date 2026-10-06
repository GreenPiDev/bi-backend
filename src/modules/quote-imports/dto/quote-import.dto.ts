import { z } from 'zod';

/** Bilinen hedef Quote alanlari - kullanici sihirbazda bir kaynak kolonu bunlardan
 * birine esleyebilir. accountName/quoteNumber/quoteDate/subtotal zorunludur (bkz.
 * QuoteImportsService.importQuotes). Kaynak dosyada ürün/miktar/birim fiyat kolonu
 * olmadigi icin (bkz. docs/VARSAYIMLAR.md) bu importtan dogan teklifler hep
 * itemsEntryMode='MANUAL_TOTAL' olarak acilir. Durum (status) burada YOK -
 * import'tan gelen her teklif sabit olarak QuoteStatus.UNSPECIFIED ile acilir,
 * kolon eslemesinden hic etkilenmez (bkz. docs/VARSAYIMLAR.md). */
export const QUOTE_IMPORT_TARGET_FIELDS = [
  'accountName',
  'quoteNumber',
  'quoteDate',
  'title',
  'subtotal',
  'totalWithVat',
  'currency',
  'senderName',
  'contactName',
] as const;
export type QuoteImportTargetField =
  (typeof QUOTE_IMPORT_TARGET_FIELDS)[number];

/** imports/dto/import-mapping.dto.ts ile ayni desen: hedef alan -> kaynak kolon basligi. */
export const QuoteImportMappingSchema = z.record(z.string(), z.string());
export type QuoteImportMappingDto = z.infer<typeof QuoteImportMappingSchema>;

/** attributes JSONB'ye aynen kopyalanacak kaynak kolon basliklari - product-imports'taki
 * ayni "bilinen alana eslenmeyen ama kaybedilmek istenmeyen kolon" deseni. */
export const QuoteImportAttributeColumnsSchema = z.array(z.string()).max(50);
export type QuoteImportAttributeColumnsDto = z.infer<
  typeof QuoteImportAttributeColumnsSchema
>;

/** TR: "1.234,56". EN: "1234.56" - product-imports/number-format.ts'teki ayni secim,
 * burada kendi tipi tekrar tanimlanir (modul kendi icinde bagimsiz kalsin diye,
 * sadece saf parseImportNumber fonksiyonu reuse edilir). */
export const NumberFormatSchema = z.enum(['tr', 'en']).default('tr');
export type NumberFormat = z.infer<typeof NumberFormatSchema>;

export const HeaderRowIndexSchema = z.coerce
  .number()
  .int()
  .min(0)
  .max(50)
  .default(0);
