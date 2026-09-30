import { z } from 'zod';
import { ListQuerySchema } from '../../../core/dto/list-query.dto';

export const AuditLogQuerySchema = ListQuerySchema.extend({
  userId: z.string().uuid().optional(),
  entity: z.string().trim().min(1).optional(),
  action: z.string().trim().min(1).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export type AuditLogQueryDto = z.infer<typeof AuditLogQuerySchema>;
