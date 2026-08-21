import { z } from 'zod';

export const DatasetFieldTypeSchema = z.enum([
  'STRING',
  'NUMBER',
  'DATE',
  'BOOLEAN',
]);

export const DatasetFieldRoleSchema = z.enum(['DIMENSION', 'MEASURE', 'DATE']);

export const UpdateDatasetFieldSchema = z.object({
  id: z.string().uuid(),
  name: z
    .string()
    .regex(/^[a-z_][a-z0-9_]{0,40}$/)
    .optional(),
  label: z.string().trim().min(1).max(200).optional(),
  type: DatasetFieldTypeSchema.optional(),
  role: DatasetFieldRoleSchema.optional(),
  format: z.string().max(100).nullable().optional(),
  isVisible: z.boolean().optional(),
});

export const UpdateDatasetFieldsSchema = z.object({
  fields: z.array(UpdateDatasetFieldSchema).min(1).max(100),
});

export type UpdateDatasetFieldDto = z.infer<typeof UpdateDatasetFieldSchema>;
export type UpdateDatasetFieldsDto = z.infer<typeof UpdateDatasetFieldsSchema>;
