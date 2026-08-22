import { z } from 'zod';

export const LayoutItemSchema = z.object({
  widgetId: z.string().uuid(),
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  w: z.number().int().min(1),
  h: z.number().int().min(1),
});
export type LayoutItemDto = z.infer<typeof LayoutItemSchema>;

export const CreateDashboardSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).optional(),
});
export type CreateDashboardDto = z.infer<typeof CreateDashboardSchema>;

export const UpdateDashboardSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  layout: z.array(LayoutItemSchema).max(100).optional(),
  filters: z.array(z.unknown()).max(20).optional(),
});
export type UpdateDashboardDto = z.infer<typeof UpdateDashboardSchema>;
