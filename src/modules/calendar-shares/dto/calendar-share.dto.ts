import { z } from 'zod';

export const UpdateCalendarGrantsSchema = z.object({
  viewerIds: z.array(z.string().uuid()).max(500),
});
export type UpdateCalendarGrantsDto = z.infer<
  typeof UpdateCalendarGrantsSchema
>;
