import { z } from 'zod';

export const UploadDatasourceSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
});

export type UploadDatasourceDto = z.infer<typeof UploadDatasourceSchema>;
