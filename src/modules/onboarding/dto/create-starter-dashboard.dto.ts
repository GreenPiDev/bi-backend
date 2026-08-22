import { z } from 'zod';

export const CreateStarterDashboardSchema = z.object({
  datasetId: z.string().uuid(),
});
export type CreateStarterDashboardDto = z.infer<
  typeof CreateStarterDashboardSchema
>;
