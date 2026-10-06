import { z } from 'zod';

/**
 * Faz D8'de `type` alani eklendi (bkz. docs/VARSAYIMLAR.md V56, Prisma enum
 * DrawingTemplateType) - OG_CELL (orta gerilim hucresi) AG_BACKPLATE'in yanina
 * eklendi. Varsayilan AG_BACKPLATE (geriye donuk uyum: D1-D7'de olusturulmus
 * tum sablonlar zaten bu tipte).
 */
export const CreateDrawingPanelTemplateSchema = z.object({
  name: z.string().trim().min(2, 'Ad en az 2 karakter olmalidir.').max(200),
  type: z.enum(['AG_BACKPLATE', 'OG_CELL']).optional().default('AG_BACKPLATE'),
  widthMm: z.number().positive().max(10_000),
  heightMm: z.number().positive().max(10_000),
  /** Bant/yerlesim tanimi - render motoru (D4) tarafindan yorumlanacak serbest JSON,
   * burada derinlemesine dogrulanmaz (EAV kisidi bu alana uygulanmaz, bkz. CLAUDE.md §16 -
   * analitik veri degil, cizim domain verisi). */
  layout: z.record(z.string(), z.unknown()),
});
export type CreateDrawingPanelTemplateDto = z.infer<
  typeof CreateDrawingPanelTemplateSchema
>;

export const UpdateDrawingPanelTemplateSchema =
  CreateDrawingPanelTemplateSchema.partial();
export type UpdateDrawingPanelTemplateDto = z.infer<
  typeof UpdateDrawingPanelTemplateSchema
>;
