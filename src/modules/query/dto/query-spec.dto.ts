import { z } from 'zod';

/**
 * Kullanicidan gelen sorgu talebinin sozlesmesi (CLAUDE.md SS6).
 * Bu spec, beyaz listeli, parametreli SQL'e cevrilir.
 */
export const AggregationType = z.enum([
  'sum',
  'avg',
  'min',
  'max',
  'count',
  'count_distinct',
]);
export type AggregationType = z.infer<typeof AggregationType>;

export const Granularity = z.enum(['day', 'week', 'month', 'quarter', 'year']);
export type Granularity = z.infer<typeof Granularity>;

export const FilterOperator = z.enum([
  'eq',
  'neq',
  'in',
  'nin',
  'gt',
  'gte',
  'lt',
  'lte',
  'between',
  'contains',
  'is_null',
  'is_not_null',
]);
export type FilterOperator = z.infer<typeof FilterOperator>;

export const MeasureSpec = z.object({
  field: z.string(),
  agg: AggregationType,
  alias: z.string().regex(/^[a-z_][a-z0-9_]{0,40}$/i),
});
export type MeasureSpec = z.infer<typeof MeasureSpec>;

export const DimensionSpec = z.object({
  field: z.string(),
  granularity: Granularity.optional(),
});
export type DimensionSpec = z.infer<typeof DimensionSpec>;

export const FilterSpec = z.object({
  field: z.string(),
  op: FilterOperator,
  value: z.unknown().optional(),
});
export type FilterSpec = z.infer<typeof FilterSpec>;

export const OrderBySpec = z.object({
  field: z.string(),
  dir: z.enum(['asc', 'desc']),
});
export type OrderBySpec = z.infer<typeof OrderBySpec>;

export const QuerySpec = z.object({
  datasetId: z.string().uuid(),
  measures: z.array(MeasureSpec).max(10),
  dimensions: z.array(DimensionSpec).max(5),
  filters: z.array(FilterSpec).max(20),
  orderBy: z.array(OrderBySpec).max(3),
  limit: z.number().int().min(1).max(10_000).default(1000),
});
export type QuerySpec = z.infer<typeof QuerySpec>;

export const QueryColumn = z.object({
  name: z.string(),
  type: z.enum(['STRING', 'NUMBER', 'DATE', 'BOOLEAN']),
  label: z.string(),
});
export type QueryColumn = z.infer<typeof QueryColumn>;

export const QueryResult = z.object({
  columns: z.array(QueryColumn),
  rows: z.array(z.array(z.unknown())),
  rowCount: z.number().int(),
  executionMs: z.number(),
  truncated: z.boolean(),
});
export type QueryResult = z.infer<typeof QueryResult>;
