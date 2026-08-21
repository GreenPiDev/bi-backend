import { z } from 'zod';

export const ToggleModuleSchema = z.object({
  enabled: z.boolean(),
});

export type ToggleModuleDto = z.infer<typeof ToggleModuleSchema>;
