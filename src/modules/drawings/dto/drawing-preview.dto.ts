import { z } from 'zod';

/**
 * Faz D4: render motorunu gercek tenant verisiyle (kutuphane/sablon) salt-okunur
 * onizlemek icin - hicbir sey persist etmez. Quote/Product'tan otomatik Drawing
 * uretme akisi (gercek band-atama sorunu dahil) kasitli olarak Faz D5/D6'ya
 * birakildi (bkz. docs/VARSAYIMLAR.md V53) - burada bandKey kullanici tarafindan
 * elle secilir.
 */
export const DrawingPreviewItemSchema = z.object({
  libraryComponentKey: z.string().trim().min(1).max(100),
  label: z.string().trim().min(1).max(200),
  category: z.string().trim().min(1).max(100),
  widthMm: z.number().positive().max(2000),
  heightMm: z.number().positive().max(2000),
  bandKey: z.string().trim().min(1),
  quantity: z.number().int().min(1).max(50).default(1),
  /** Belirtilmezse kategoriye gore varsayilan belirlenir (CT/CAPACITOR -> gizli). */
  hiddenInCoverPlate: z.boolean().optional(),
});
export type DrawingPreviewItemDto = z.infer<typeof DrawingPreviewItemSchema>;

export const DrawingPreviewBusbarSchema = z.object({
  startX: z.number().min(0),
  startY: z.number().min(0),
  endX: z.number().min(0),
  endY: z.number().min(0),
  thicknessMm: z.number().positive().max(100),
  phaseCount: z.number().int().min(1).max(4).default(3),
});
export type DrawingPreviewBusbarDto = z.infer<
  typeof DrawingPreviewBusbarSchema
>;

export const DrawingPreviewRequestSchema = z.object({
  templateId: z.string().uuid(),
  items: z.array(DrawingPreviewItemSchema).max(100).default([]),
  busbars: z.array(DrawingPreviewBusbarSchema).max(20).default([]),
});
export type DrawingPreviewRequestDto = z.infer<
  typeof DrawingPreviewRequestSchema
>;
