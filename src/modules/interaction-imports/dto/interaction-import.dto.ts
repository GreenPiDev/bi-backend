import { z } from 'zod';

/** imports/dto/import-mapping.dto.ts ile ayni desen: hedef alan -> kaynak kolon basligi. */
export const InteractionImportMappingSchema = z.record(z.string(), z.string());
export type InteractionImportMappingDto = z.infer<
  typeof InteractionImportMappingSchema
>;

/** customFields JSONB'ye aynen kopyalanacak kaynak kolon basliklari - bilinen alana
 * eslenmeyen ama kullanicinin kaybetmek istemedigi kolonlar (orn. "Kaynak", "Kampanya").
 * accounts/product-imports'un attributeColumns'iyla ayni desen (bkz. docs/VARSAYIMLAR.md V41). */
export const InteractionImportAttributeColumnsSchema = z
  .array(z.string())
  .max(50);
export type InteractionImportAttributeColumnsDto = z.infer<
  typeof InteractionImportAttributeColumnsSchema
>;

export const HeaderRowIndexSchema = z.coerce
  .number()
  .int()
  .min(0)
  .max(50)
  .default(0);
