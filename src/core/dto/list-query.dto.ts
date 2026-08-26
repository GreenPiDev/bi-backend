import { z } from 'zod';

export const ListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
  q: z.string().trim().min(1).optional(),
  sort: z.string().optional(),
});

export type ListQueryDto = z.infer<typeof ListQuerySchema>;

export interface PagedResult<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

export function parseSort(
  sort: string | undefined,
  allowedFields: readonly string[],
  fallback: { field: string; direction: 'asc' | 'desc' },
): { field: string; direction: 'asc' | 'desc' } {
  if (!sort) {
    return fallback;
  }
  const [field, direction] = sort.split(':');
  if (
    !field ||
    !allowedFields.includes(field) ||
    (direction !== 'asc' && direction !== 'desc')
  ) {
    return fallback;
  }
  return { field, direction };
}
