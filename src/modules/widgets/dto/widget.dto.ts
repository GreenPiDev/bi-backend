import { z } from 'zod';
import { QuerySpec } from '../../query/dto/query-spec.dto';

export const WidgetType = z.enum([
  'kpi',
  'line',
  'bar',
  'bar_horizontal',
  'pie',
  'table',
]);
export type WidgetType = z.infer<typeof WidgetType>;

export const WidgetPositionSchema = z.object({
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  w: z.number().int().min(1),
  h: z.number().int().min(1),
});
export type WidgetPositionDto = z.infer<typeof WidgetPositionSchema>;

export const CreateWidgetSchema = z.object({
  type: WidgetType,
  title: z.string().trim().min(1).max(100),
  querySpec: QuerySpec,
  vizOptions: z.record(z.string(), z.unknown()).default({}),
  position: WidgetPositionSchema,
});
export type CreateWidgetDto = z.infer<typeof CreateWidgetSchema>;

export const UpdateWidgetSchema = z.object({
  type: WidgetType.optional(),
  title: z.string().trim().min(1).max(100).optional(),
  querySpec: QuerySpec.optional(),
  vizOptions: z.record(z.string(), z.unknown()).optional(),
  position: WidgetPositionSchema.optional(),
});
export type UpdateWidgetDto = z.infer<typeof UpdateWidgetSchema>;
