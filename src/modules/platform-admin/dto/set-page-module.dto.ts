import { z } from 'zod';

export const SetPageModuleSchema = z.object({
  moduleKeys: z.array(z.string().min(1)),
});

export type SetPageModuleDto = z.infer<typeof SetPageModuleSchema>;
