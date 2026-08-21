import type { DatasetField, DatasetFieldType } from '@prisma/client';
import { sql, type RawBuilder } from 'kysely';
import {
  datasetTableName,
  tenantSchemaName,
} from '../../core/database/identifier';
import type {
  AggregationType,
  DimensionSpec,
  FilterSpec,
  OrderBySpec,
  QuerySpec,
} from './dto/query-spec.dto';

export interface BuiltColumn {
  name: string;
  type: DatasetFieldType;
  label: string;
}

export interface BuiltQuery {
  raw: RawBuilder<Record<string, unknown>>;
  columns: BuiltColumn[];
}

const AGG_EXPR: Record<
  AggregationType,
  (col: RawBuilder<unknown>) => RawBuilder<unknown>
> = {
  sum: (c) => sql`sum(${c})`,
  avg: (c) => sql`avg(${c})`,
  min: (c) => sql`min(${c})`,
  max: (c) => sql`max(${c})`,
  count: (c) => sql`count(${c})`,
  count_distinct: (c) => sql`count(distinct ${c})`,
};

function tableRef(tenantId: string, datasetId: string): RawBuilder<unknown> {
  const schema = tenantSchemaName(tenantId);
  const table = datasetTableName(datasetId);
  return sql.table(`${schema}.${table}`);
}

function dimensionExpr(
  field: DatasetField,
  dim: DimensionSpec,
): RawBuilder<unknown> {
  const colRef = sql.ref(field.name);
  return dim.granularity
    ? sql`date_trunc(${dim.granularity}, ${colRef})`
    : colRef;
}

function filterExpr(
  filter: FilterSpec,
  field: DatasetField,
): RawBuilder<unknown> {
  const colRef = sql.ref(field.name);
  switch (filter.op) {
    case 'eq':
      return sql`${colRef} = ${filter.value}`;
    case 'neq':
      return sql`${colRef} <> ${filter.value}`;
    case 'gt':
      return sql`${colRef} > ${filter.value}`;
    case 'gte':
      return sql`${colRef} >= ${filter.value}`;
    case 'lt':
      return sql`${colRef} < ${filter.value}`;
    case 'lte':
      return sql`${colRef} <= ${filter.value}`;
    case 'in':
      return sql`${colRef} IN (${sql.join(filter.value as unknown[])})`;
    case 'nin':
      return sql`${colRef} NOT IN (${sql.join(filter.value as unknown[])})`;
    case 'between': {
      const [min, max] = filter.value as [unknown, unknown];
      return sql`${colRef} BETWEEN ${min} AND ${max}`;
    }
    case 'contains':
      return sql`${colRef} ILIKE ${`%${String(filter.value)}%`}`;
    case 'is_null':
      return sql`${colRef} IS NULL`;
    case 'is_not_null':
      return sql`${colRef} IS NOT NULL`;
  }
}

function buildWhere(
  filters: FilterSpec[],
  fieldsByName: Map<string, DatasetField>,
): RawBuilder<unknown> {
  if (filters.length === 0) {
    return sql``;
  }
  const exprs = filters.map((f) => filterExpr(f, fieldsByName.get(f.field)!));
  return sql`where ${sql.join(exprs, sql` and `)}`;
}

function buildOrderBy(orderBy: OrderBySpec[]): RawBuilder<unknown> {
  if (orderBy.length === 0) {
    return sql``;
  }
  const parts = orderBy.map(
    (o) => sql`${sql.ref(o.field)} ${o.dir === 'asc' ? sql`asc` : sql`desc`}`,
  );
  return sql`order by ${sql.join(parts)}`;
}

function visibleColumns(fields: DatasetField[]): DatasetField[] {
  return [...fields]
    .filter((f) => f.isVisible)
    .sort((a, b) => a.ordinal - b.ordinal);
}

/** Ham satir listesi (drill-down ve bos measures+dimensions durumu icin ortak). */
function buildRowsSelect(fields: DatasetField[]): {
  select: RawBuilder<unknown>;
  columns: BuiltColumn[];
} {
  const visible = visibleColumns(fields);
  const parts = visible.map((f) => sql`${sql.ref(f.name)}`);
  const columns: BuiltColumn[] = visible.map((f) => ({
    name: f.name,
    type: f.type,
    label: f.label,
  }));
  return { select: parts.length > 0 ? sql.join(parts) : sql`1`, columns };
}

export function buildAggregationQuery(
  spec: QuerySpec,
  fieldsByName: Map<string, DatasetField>,
  allFields: DatasetField[],
  tenantId: string,
): BuiltQuery {
  const table = tableRef(tenantId, spec.datasetId);
  const where = buildWhere(spec.filters, fieldsByName);
  const orderBy = buildOrderBy(spec.orderBy);
  const limit = spec.limit + 1;

  if (spec.measures.length === 0 && spec.dimensions.length === 0) {
    const { select, columns } = buildRowsSelect(allFields);
    const raw = sql<
      Record<string, unknown>
    >`select ${select} from ${table} ${where} ${orderBy} limit ${limit}`;
    return { raw, columns };
  }

  const selectParts: RawBuilder<unknown>[] = [];
  const groupByParts: RawBuilder<unknown>[] = [];
  const columns: BuiltColumn[] = [];

  for (const dim of spec.dimensions) {
    const field = fieldsByName.get(dim.field)!;
    const expr = dimensionExpr(field, dim);
    selectParts.push(sql`${expr} as ${sql.ref(dim.field)}`);
    groupByParts.push(expr);
    columns.push({
      name: dim.field,
      type: dim.granularity ? 'DATE' : field.type,
      label: field.label,
    });
  }

  for (const measure of spec.measures) {
    const field = fieldsByName.get(measure.field)!;
    const aggExpr = AGG_EXPR[measure.agg](sql.ref(field.name));
    selectParts.push(sql`${aggExpr} as ${sql.ref(measure.alias)}`);
    columns.push({ name: measure.alias, type: 'NUMBER', label: measure.alias });
  }

  const select = sql.join(selectParts);
  const groupBy =
    groupByParts.length > 0 ? sql`group by ${sql.join(groupByParts)}` : sql``;

  const raw = sql<
    Record<string, unknown>
  >`select ${select} from ${table} ${where} ${groupBy} ${orderBy} limit ${limit}`;
  return { raw, columns };
}

export function buildRowsQuery(
  spec: QuerySpec,
  fieldsByName: Map<string, DatasetField>,
  allFields: DatasetField[],
  tenantId: string,
): BuiltQuery {
  const table = tableRef(tenantId, spec.datasetId);
  const where = buildWhere(spec.filters, fieldsByName);
  const orderBy = buildOrderBy(spec.orderBy);
  const limit = spec.limit + 1;
  const { select, columns } = buildRowsSelect(allFields);
  const raw = sql<
    Record<string, unknown>
  >`select ${select} from ${table} ${where} ${orderBy} limit ${limit}`;
  return { raw, columns };
}
