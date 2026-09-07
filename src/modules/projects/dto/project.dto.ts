import { z } from 'zod';
import { ListQuerySchema } from '../../../core/dto/list-query.dto';

export const CreateProjectSchema = z.object({
  accountId: z.string().uuid(),
  /** P2: opsiyonel, zorunlu degil. */
  quoteId: z.string().uuid().optional(),
  name: z.string().trim().min(2, 'Proje adi en az 2 karakter olmalidir.'),
  estimatedBudget: z.number().nonnegative(),
  actualCost: z.number().nonnegative().optional(),
});
export type CreateProjectDto = z.infer<typeof CreateProjectSchema>;

export const UpdateProjectSchema = z.object({
  name: z.string().trim().min(2).optional(),
  estimatedBudget: z.number().nonnegative().optional(),
  actualCost: z.number().nonnegative().optional(),
});
export type UpdateProjectDto = z.infer<typeof UpdateProjectSchema>;

export const ProjectQuerySchema = ListQuerySchema.extend({
  accountId: z.string().uuid().optional(),
});
export type ProjectQueryDto = z.infer<typeof ProjectQuerySchema>;
