import { z } from 'zod';
import { ListQuerySchema } from '../../../core/dto/list-query.dto';
import {
  MAX_CHANGES_PER_SAVE,
  MAX_COLS_PER_SHEET,
  MAX_ROWS_PER_SHEET,
} from '../spreadsheets.constants';

export const SpreadsheetQuerySchema = ListQuerySchema;
export type SpreadsheetQueryDto = z.infer<typeof SpreadsheetQuerySchema>;

export const SpreadsheetNameSchema = z
  .string()
  .trim()
  .min(1, 'Tablo adi zorunludur.')
  .max(200, 'Tablo adi en fazla 200 karakter olabilir.');

export const UpdateSpreadsheetSchema = z.object({
  name: SpreadsheetNameSchema,
});
export type UpdateSpreadsheetDto = z.infer<typeof UpdateSpreadsheetSchema>;

const HexColorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, 'Renk #RRGGBB biciminde olmalidir.')
  .transform((v) => v.toUpperCase())
  .nullable();

/** Hucrenin degisiklik sonrasi TAM hali gonderilir (kismi patch degil); baseVersion
 * istemcinin yukledigi surumdur (hucre hic yoksa 0) - catisma tespiti buna dayanir. */
export const SpreadsheetCellChangeSchema = z.object({
  row: z
    .number()
    .int()
    .min(0)
    .max(MAX_ROWS_PER_SHEET - 1),
  col: z
    .number()
    .int()
    .min(0)
    .max(MAX_COLS_PER_SHEET - 1),
  value: z.string().max(10_000).nullable(),
  bgColor: HexColorSchema,
  fontColor: HexColorSchema,
  baseVersion: z.number().int().min(0),
});
export type SpreadsheetCellChangeDto = z.infer<
  typeof SpreadsheetCellChangeSchema
>;

export const SaveSpreadsheetChangesSchema = z.object({
  changes: z
    .array(SpreadsheetCellChangeSchema)
    .min(1, 'Kaydedilecek degisiklik yok.')
    .max(
      MAX_CHANGES_PER_SAVE,
      `Tek seferde en fazla ${MAX_CHANGES_PER_SAVE} hucre kaydedilebilir.`,
    ),
  force: z.boolean().optional(),
});
export type SaveSpreadsheetChangesDto = z.infer<
  typeof SaveSpreadsheetChangesSchema
>;
