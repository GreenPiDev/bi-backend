import { z } from 'zod';

/** modules/product-imports/dto/product-import.dto.ts'teki HeaderRowIndexSchema ile ayni
 * sinirlar - core `datasources` modulu CRM'e ozgu `product-imports` modulune bagimli
 * olmamali, bu yuzden ayni sema burada da tanimlaniyor (packages/shared olmamasiyla ayni
 * gerekce, bkz. CLAUDE.md SS3). */
export const HeaderRowIndexSchema = z.coerce
  .number()
  .int()
  .min(0)
  .max(50)
  .default(0);

export const UploadDatasourceSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  headerRowIndex: HeaderRowIndexSchema,
});

export type UploadDatasourceDto = z.infer<typeof UploadDatasourceSchema>;
