import { z } from 'zod';
import { ListQuerySchema } from '../../../core/dto/list-query.dto';

// Project.estimatedBudget/actualCost @db.Decimal(14, 2) - DB'nin kabul edebilecegi ust sinir.
const MAX_DECIMAL_14_2 = 999_999_999_999.99;

export const CreateProjectSchema = z.object({
  accountId: z.string().uuid(),
  name: z.string().trim().min(2, 'Proje adi en az 2 karakter olmalidir.'),
  estimatedBudget: z
    .number()
    .nonnegative()
    .max(MAX_DECIMAL_14_2, 'Tahmini butce cok buyuk.'),
  actualCost: z
    .number()
    .nonnegative()
    .max(MAX_DECIMAL_14_2, 'Gerceklesen maliyet cok buyuk.')
    .optional(),
});
export type CreateProjectDto = z.infer<typeof CreateProjectSchema>;

export const UpdateProjectSchema = z.object({
  name: z.string().trim().min(2).optional(),
  estimatedBudget: z
    .number()
    .nonnegative()
    .max(MAX_DECIMAL_14_2, 'Tahmini butce cok buyuk.')
    .optional(),
  actualCost: z
    .number()
    .nonnegative()
    .max(MAX_DECIMAL_14_2, 'Gerceklesen maliyet cok buyuk.')
    .optional(),
  /**
   * Bu projeyle iliskilendirilecek tekliflerin tam listesi (replace semantigi) -
   * proje olustururken degil, sadece duzenlerken setlenir. Verilirse, halihazirda
   * bu projeye bagli ama listede olmayan teklifler unlink edilir (bkz.
   * ProjectsService.update).
   */
  quoteIds: z.array(z.string().uuid()).max(200).optional(),
});
export type UpdateProjectDto = z.infer<typeof UpdateProjectSchema>;

export const ProjectQuerySchema = ListQuerySchema.extend({
  accountId: z.string().uuid().optional(),
});
export type ProjectQueryDto = z.infer<typeof ProjectQuerySchema>;
