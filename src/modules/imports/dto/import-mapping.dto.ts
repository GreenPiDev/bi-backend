import { z } from 'zod';

export const ImportMappingSchema = z.record(z.string(), z.string());
export type ImportMappingDto = z.infer<typeof ImportMappingSchema>;
