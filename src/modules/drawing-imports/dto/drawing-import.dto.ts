import { z } from 'zod';

/**
 * AI'nin uretebilecegi TEK sema - kasitli olarak x/y/rotasyon/geometri alani
 * YOK (bkz. docs/VARSAYIMLAR.md V52 "AI asla koordinat/geometri uretmez" kurali,
 * bu kisit burada SEMA SEVIYESINDE zorlanir, AI ciktisi bu sema disina asla
 * gecemez).
 */
export const DrawingImportSuggestedLineSchema = z.object({
  rawLine: z.string().trim().min(1).max(500),
  panelGroupLabel: z.string().trim().min(1).max(200),
  productId: z.string().uuid().nullable(),
  quantity: z.number().int().min(1).max(999),
  confidence: z.number().min(0).max(1),
});
export type DrawingImportSuggestedLineDto = z.infer<
  typeof DrawingImportSuggestedLineSchema
>;

export const DrawingImportAiResponseSchema = z.object({
  lines: z.array(DrawingImportSuggestedLineSchema).max(200).default([]),
});

export const DrawingImportPreviewQuerySchema = z.object({
  quoteId: z.string().uuid(),
});
export type DrawingImportPreviewQueryDto = z.infer<
  typeof DrawingImportPreviewQuerySchema
>;

const DrawingImportCommitItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().min(1).max(999),
});

const DrawingImportCommitGroupSchema = z.object({
  panelGroupLabel: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(200),
  items: z.array(DrawingImportCommitItemSchema).min(1).max(100),
});

export const DrawingImportCommitSchema = z.object({
  quoteId: z.string().uuid(),
  templateId: z.string().uuid(),
  groups: z.array(DrawingImportCommitGroupSchema).min(1).max(20),
});
export type DrawingImportCommitDto = z.infer<typeof DrawingImportCommitSchema>;
