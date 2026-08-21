import { HttpStatus } from '@nestjs/common';
import type { DatasetField } from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import type {
  DimensionSpec,
  FilterSpec,
  MeasureSpec,
  OrderBySpec,
  QuerySpec,
} from './dto/query-spec.dto';

function unknownField(name: string): AppException {
  return new AppException(
    'UNKNOWN_FIELD',
    `"${name}" adinda bir alan bulunamadi.`,
    HttpStatus.BAD_REQUEST,
  );
}

function invalidAggregation(message: string): AppException {
  return new AppException(
    'INVALID_AGGREGATION',
    message,
    HttpStatus.BAD_REQUEST,
  );
}

function invalidFilter(message: string): AppException {
  return new AppException('INVALID_FILTER', message, HttpStatus.BAD_REQUEST);
}

function duplicateAlias(name: string): AppException {
  return new AppException(
    'DUPLICATE_ALIAS',
    `"${name}" adi birden fazla kolon icin kullanilamaz. Farkli bir isim secin.`,
    HttpStatus.BAD_REQUEST,
  );
}

export function buildFieldMap(
  fields: DatasetField[],
): Map<string, DatasetField> {
  return new Map(fields.map((f) => [f.name, f]));
}

export function resolveField(
  fieldsByName: Map<string, DatasetField>,
  name: string,
): DatasetField {
  const field = fieldsByName.get(name);
  if (!field) {
    throw unknownField(name);
  }
  return field;
}

function validateFilters(
  filters: FilterSpec[],
  fieldsByName: Map<string, DatasetField>,
): void {
  for (const filter of filters) {
    const field = resolveField(fieldsByName, filter.field);
    switch (filter.op) {
      case 'in':
      case 'nin':
        if (!Array.isArray(filter.value) || filter.value.length === 0) {
          throw invalidFilter(
            `"${field.label}" filtresi icin en az bir deger gerekli.`,
          );
        }
        break;
      case 'between':
        if (!Array.isArray(filter.value) || filter.value.length !== 2) {
          throw invalidFilter(
            `"${field.label}" filtresi icin alt ve ust sinir birlikte gerekli.`,
          );
        }
        break;
      case 'eq':
      case 'neq':
      case 'gt':
      case 'gte':
      case 'lt':
      case 'lte':
        if (
          filter.value === undefined ||
          filter.value === null ||
          Array.isArray(filter.value)
        ) {
          throw invalidFilter(
            `"${field.label}" filtresi icin bir deger gerekli.`,
          );
        }
        break;
      case 'contains':
        if (field.type !== 'STRING') {
          throw invalidFilter(
            `"${field.label}" alaninda metin aramasi yapilamaz.`,
          );
        }
        if (typeof filter.value !== 'string' || filter.value.length === 0) {
          throw invalidFilter(
            `"${field.label}" filtresi icin bir metin gerekli.`,
          );
        }
        break;
      case 'is_null':
      case 'is_not_null':
        if (filter.value !== undefined) {
          throw invalidFilter(`"${field.label}" filtresi bir deger almaz.`);
        }
        break;
    }
  }
}

function validateMeasures(
  measures: MeasureSpec[],
  fieldsByName: Map<string, DatasetField>,
): void {
  for (const measure of measures) {
    const field = resolveField(fieldsByName, measure.field);
    if (
      (measure.agg === 'sum' || measure.agg === 'avg') &&
      field.type !== 'NUMBER'
    ) {
      throw invalidAggregation(
        `"${field.label}" alani sayisal olmadigi icin toplanamaz.`,
      );
    }
  }
}

function validateDimensions(
  dimensions: DimensionSpec[],
  fieldsByName: Map<string, DatasetField>,
): void {
  for (const dimension of dimensions) {
    const field = resolveField(fieldsByName, dimension.field);
    if (dimension.granularity && field.type !== 'DATE') {
      throw invalidAggregation(
        `"${field.label}" alani tarih olmadigi icin zaman araligina bolunemez.`,
      );
    }
  }
}

function collectOutputNames(
  measures: MeasureSpec[],
  dimensions: DimensionSpec[],
): Set<string> {
  const names = new Set<string>();
  for (const dimension of dimensions) {
    if (names.has(dimension.field)) {
      throw duplicateAlias(dimension.field);
    }
    names.add(dimension.field);
  }
  for (const measure of measures) {
    if (names.has(measure.alias)) {
      throw duplicateAlias(measure.alias);
    }
    names.add(measure.alias);
  }
  return names;
}

function validateOrderBy(
  orderBy: OrderBySpec[],
  allowedNames: Set<string>,
): void {
  for (const order of orderBy) {
    if (!allowedNames.has(order.field)) {
      throw unknownField(order.field);
    }
  }
}

export interface ValidatedAggregationQuery {
  fieldsByName: Map<string, DatasetField>;
  outputNames: Set<string>;
}

/** `/query` (agregasyon) icin tam dogrulama. Bos measures+dimensions da gecerlidir. */
export function validateAggregationQuery(
  spec: QuerySpec,
  fields: DatasetField[],
): ValidatedAggregationQuery {
  const fieldsByName = buildFieldMap(fields);
  validateMeasures(spec.measures, fieldsByName);
  validateDimensions(spec.dimensions, fieldsByName);
  validateFilters(spec.filters, fieldsByName);
  const outputNames = collectOutputNames(spec.measures, spec.dimensions);
  validateOrderBy(spec.orderBy, outputNames);
  return { fieldsByName, outputNames };
}

/** `/query/rows` (drill-down) icin dogrulama: measures/dimensions yok sayilir. */
export function validateRowsQuery(
  spec: QuerySpec,
  fields: DatasetField[],
): Map<string, DatasetField> {
  const fieldsByName = buildFieldMap(fields);
  validateFilters(spec.filters, fieldsByName);
  validateOrderBy(spec.orderBy, new Set(fieldsByName.keys()));
  return fieldsByName;
}
