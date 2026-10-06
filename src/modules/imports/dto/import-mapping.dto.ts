import { z } from 'zod';

export const ImportMappingSchema = z.record(z.string(), z.string());
export type ImportMappingDto = z.infer<typeof ImportMappingSchema>;

/** attributes/customFields'a aynen kopyalanacak kaynak kolon basliklari - product-imports'un
 * ProductImportAttributeColumnsSchema'siyla birebir ayni; Account ve Contact ice aktarma
 * sihirbazlari ayni jenerik semayi paylasir. */
export const ImportAttributeColumnsSchema = z.array(z.string()).max(50);
export type ImportAttributeColumnsDto = z.infer<
  typeof ImportAttributeColumnsSchema
>;

export const HeaderRowIndexSchema = z.coerce
  .number()
  .int()
  .min(0)
  .max(50)
  .default(0);
