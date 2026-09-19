import { z } from 'zod';

/** Bilinen hedef Product alanlari - kullanici sihirbazda bir kaynak kolonu bunlardan
 * birine esleyebilir. Bunlarin disinda kalan kolonlar attributeColumns ile secilirse
 * Product.attributes JSONB'ye, hicbiri secilmezse hic ice aktarilmaz. */
export const PRODUCT_IMPORT_TARGET_FIELDS = [
  'name',
  'sku',
  'unit',
  'price',
  'currency',
  'description',
  'category',
  'costPrice',
  'minStockLevel',
  'maxDiscountPct',
] as const;
export type ProductImportTargetField =
  (typeof PRODUCT_IMPORT_TARGET_FIELDS)[number];

/** imports/dto/import-mapping.dto.ts ile ayni desen: hedef alan -> kaynak kolon basligi. */
export const ProductImportMappingSchema = z.record(z.string(), z.string());
export type ProductImportMappingDto = z.infer<
  typeof ProductImportMappingSchema
>;

/** attributes JSONB'ye aynen kopyalanacak kaynak kolon basliklari (bilinen alana
 * eslenmeyen ama kullanicinin kaybetmek istemedigi kolonlar - orn. "Seri"). */
export const ProductImportAttributeColumnsSchema = z.array(z.string()).max(50);
export type ProductImportAttributeColumnsDto = z.infer<
  typeof ProductImportAttributeColumnsSchema
>;

/** TR: "1.234,56" (nokta bin ayraci, virgul ondalik). EN: "1234.56" / "65056.00"
 * (nokta ondalik, bin ayraci yok). Kullanici dosyayi yuklerken secer - farkli
 * markalarin fiyat kolonlari farkli formatlarda gelebiliyor (bkz. docs/VARSAYIMLAR.md
 * V40), otomatik tahmin riskli oldugu icin yapilmiyor. */
export const NumberFormatSchema = z.enum(['tr', 'en']).default('tr');
export type NumberFormat = z.infer<typeof NumberFormatSchema>;

export const HeaderRowIndexSchema = z.coerce
  .number()
  .int()
  .min(0)
  .max(50)
  .default(0);
