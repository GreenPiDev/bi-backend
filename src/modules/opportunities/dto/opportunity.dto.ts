import { z } from 'zod';
import { ListQuerySchema } from '../../../core/dto/list-query.dto';

export const OpportunityStageSchema = z.enum([
  'NEW',
  'QUALIFIED',
  'PROPOSAL',
  'WON',
  'LOST',
]);

export const CreateOpportunitySchema = z.object({
  accountId: z.string().uuid(),
  name: z.string().trim().min(2, 'Firsat adi en az 2 karakter olmalidir.'),
  stage: OpportunityStageSchema.optional(),
  estimatedValue: z.number().nonnegative().optional(),
});
export type CreateOpportunityDto = z.infer<typeof CreateOpportunitySchema>;

export const UpdateOpportunitySchema = z.object({
  name: z.string().trim().min(2).optional(),
  stage: OpportunityStageSchema.optional(),
  estimatedValue: z.number().nonnegative().optional(),
});
export type UpdateOpportunityDto = z.infer<typeof UpdateOpportunitySchema>;

export const OpportunityQuerySchema = ListQuerySchema.extend({
  accountId: z.string().uuid().optional(),
  stage: OpportunityStageSchema.optional(),
});
export type OpportunityQueryDto = z.infer<typeof OpportunityQuerySchema>;
