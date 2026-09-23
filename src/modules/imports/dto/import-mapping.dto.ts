import { z } from 'zod';

export const ImportMappingSchema = z.record(z.string(), z.string());
export type ImportMappingDto = z.infer<typeof ImportMappingSchema>;

/** attributes/customFields'a aynen kopyalanacak kaynak kolon basliklari - product-imports'un
 * ProductImportAttributeColumnsSchema'siyla birebir ayni, Account tarafi icin ayrica tanimli. */
export const AccountImportAttributeColumnsSchema = z.array(z.string()).max(50);
export type AccountImportAttributeColumnsDto = z.infer<
  typeof AccountImportAttributeColumnsSchema
>;

export const HeaderRowIndexSchema = z.coerce
  .number()
  .int()
  .min(0)
  .max(50)
  .default(0);
