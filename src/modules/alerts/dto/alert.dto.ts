import { z } from 'zod';

export const AlertOperator = z.enum(['lt', 'lte', 'gt', 'gte']);
export type AlertOperator = z.infer<typeof AlertOperator>;

export const CreateAlertSchema = z.object({
  widgetId: z.string().uuid(),
  operator: AlertOperator,
  threshold: z.number(),
  recipients: z.array(z.string().email()).min(1).max(20),
});
export type CreateAlertDto = z.infer<typeof CreateAlertSchema>;

export const UpdateAlertSchema = z.object({
  operator: AlertOperator.optional(),
  threshold: z.number().optional(),
  recipients: z.array(z.string().email()).min(1).max(20).optional(),
});
export type UpdateAlertDto = z.infer<typeof UpdateAlertSchema>;
