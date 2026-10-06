import { z } from 'zod';
import {
  DrawingPreviewBusbarSchema,
  DrawingPreviewItemSchema,
} from './drawing-preview.dto';

export const DrawingQuerySchema = z.object({
  quoteId: z.string().uuid().optional(),
});
export type DrawingQueryDto = z.infer<typeof DrawingQuerySchema>;

/**
 * Faz D5: bir Quote icin elle (PDF/AI olmadan) bir taslak Drawing olusturur - D4'teki
 * `POST /drawings/preview` ile AYNI auto-pack motorunu kullanir, farki PERSIST
 * etmesidir. Gercek PDF pre-processing + AI eslestirme akisi Faz D6'da gelecek.
 */
export const CreateDrawingSchema = z.object({
  quoteId: z.string().uuid(),
  templateId: z.string().uuid(),
  name: z.string().trim().min(1, 'Ad gereklidir.').max(200),
  panelGroupLabel: z.string().trim().max(200).optional(),
  items: z.array(DrawingPreviewItemSchema).max(100).default([]),
  busbars: z.array(DrawingPreviewBusbarSchema).max(20).default([]),
});
export type CreateDrawingDto = z.infer<typeof CreateDrawingSchema>;

const DrawingElementInstanceSchema = z.object({
  id: z.string().min(1),
  libraryComponentKey: z.string().min(1),
  label: z.string().min(1).max(200),
  category: z.string().min(1).max(100),
  bandKey: z.string().min(1),
  x: z.number(),
  y: z.number(),
  widthMm: z.number().positive(),
  heightMm: z.number().positive(),
  rotationDeg: z.number(),
});

const DrawingBusbarInstanceSchema = z.object({
  id: z.string().min(1),
  startX: z.number(),
  startY: z.number(),
  endX: z.number(),
  endY: z.number(),
  thicknessMm: z.number().positive(),
  phaseCount: z.number().int().min(1).max(4),
});

/**
 * Faz D5 editorunun "Kaydet" ucunun govdesi - model her zaman TAM (3 gorunum birden)
 * gonderilir, "tek dogruluk kaynagi model, canvas sadece view" ilkesiyle (proje-1).
 * Kismi/diff guncelleme YOK.
 */
export const DrawingModelSchema = z.object({
  plateWidthMm: z.number().positive(),
  plateHeightMm: z.number().positive(),
  views: z.object({
    internal: z.object({ elements: z.array(DrawingElementInstanceSchema) }),
    coverPlate: z.object({ elements: z.array(DrawingElementInstanceSchema) }),
    external: z.object({ elements: z.array(DrawingElementInstanceSchema) }),
  }),
  busbars: z.array(DrawingBusbarInstanceSchema),
});

export const UpdateDrawingSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  status: z.enum(['DRAFT', 'FINALIZED']).optional(),
  model: DrawingModelSchema.optional(),
});
export type UpdateDrawingDto = z.infer<typeof UpdateDrawingSchema>;
