import type { DatasetField } from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import type { QuerySpec } from './dto/query-spec.dto';
import {
  validateAggregationQuery,
  validateRowsQuery,
} from './query-validation';

function field(overrides: Partial<DatasetField>): DatasetField {
  return {
    id: 'f',
    datasetId: 'd',
    sourceName: overrides.name ?? 'x',
    name: 'x',
    label: 'X',
    type: 'STRING',
    role: 'DIMENSION',
    format: null,
    isVisible: true,
    ordinal: 0,
    ...overrides,
  } as DatasetField;
}

const FIELDS: DatasetField[] = [
  field({ name: 'sehir', label: 'Sehir', type: 'STRING', role: 'DIMENSION' }),
  field({ name: 'tutar', label: 'Tutar', type: 'NUMBER', role: 'MEASURE' }),
  field({ name: 'tarih', label: 'Tarih', type: 'DATE', role: 'DATE' }),
];

function baseSpec(overrides: Partial<QuerySpec> = {}): QuerySpec {
  return {
    datasetId: '123e4567-e89b-12d3-a456-426614174000',
    measures: [],
    dimensions: [],
    filters: [],
    orderBy: [],
    limit: 1000,
    ...overrides,
  };
}

describe('validateAggregationQuery', () => {
  it('gecerli bir agregasyon sorgusunu kabul eder', () => {
    const result = validateAggregationQuery(
      baseSpec({
        measures: [{ field: 'tutar', agg: 'sum', alias: 'toplam' }],
        dimensions: [{ field: 'sehir' }],
        orderBy: [{ field: 'toplam', dir: 'desc' }],
      }),
      FIELDS,
    );
    expect(result.outputNames).toEqual(new Set(['sehir', 'toplam']));
  });

  it('bilinmeyen measure alani UNKNOWN_FIELD firlatir', () => {
    expect(() =>
      validateAggregationQuery(
        baseSpec({ measures: [{ field: 'yok', agg: 'sum', alias: 'a' }] }),
        FIELDS,
      ),
    ).toThrowError(expect.objectContaining({ code: 'UNKNOWN_FIELD' }));
  });

  it('SQL injection denemesi iceren alan adi UNKNOWN_FIELD ile reddedilir', () => {
    expect(() =>
      validateAggregationQuery(
        baseSpec({
          filters: [{ field: 'a"; DROP TABLE x; --', op: 'eq', value: 1 }],
        }),
        FIELDS,
      ),
    ).toThrowError(expect.objectContaining({ code: 'UNKNOWN_FIELD' }));
  });

  it('metin alaninda sum INVALID_AGGREGATION firlatir', () => {
    expect(() =>
      validateAggregationQuery(
        baseSpec({ measures: [{ field: 'sehir', agg: 'sum', alias: 'a' }] }),
        FIELDS,
      ),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_AGGREGATION' }));
  });

  it('metin alaninda avg de INVALID_AGGREGATION firlatir', () => {
    expect(() =>
      validateAggregationQuery(
        baseSpec({ measures: [{ field: 'sehir', agg: 'avg', alias: 'a' }] }),
        FIELDS,
      ),
    ).toThrowError(AppException);
  });

  it('count metin alaninda serbesttir', () => {
    expect(() =>
      validateAggregationQuery(
        baseSpec({ measures: [{ field: 'sehir', agg: 'count', alias: 'a' }] }),
        FIELDS,
      ),
    ).not.toThrow();
  });

  it('date olmayan alanda granularity INVALID_AGGREGATION firlatir', () => {
    expect(() =>
      validateAggregationQuery(
        baseSpec({ dimensions: [{ field: 'sehir', granularity: 'month' }] }),
        FIELDS,
      ),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_AGGREGATION' }));
  });

  it('date alaninda granularity kabul edilir', () => {
    expect(() =>
      validateAggregationQuery(
        baseSpec({ dimensions: [{ field: 'tarih', granularity: 'month' }] }),
        FIELDS,
      ),
    ).not.toThrow();
  });

  it('measure alias dimension adiyla cakisirsa DUPLICATE_ALIAS firlatir', () => {
    expect(() =>
      validateAggregationQuery(
        baseSpec({
          dimensions: [{ field: 'sehir' }],
          measures: [{ field: 'tutar', agg: 'sum', alias: 'sehir' }],
        }),
        FIELDS,
      ),
    ).toThrowError(expect.objectContaining({ code: 'DUPLICATE_ALIAS' }));
  });

  it('iki measure ayni aliasi kullanirsa DUPLICATE_ALIAS firlatir', () => {
    expect(() =>
      validateAggregationQuery(
        baseSpec({
          measures: [
            { field: 'tutar', agg: 'sum', alias: 'a' },
            { field: 'tutar', agg: 'avg', alias: 'a' },
          ],
        }),
        FIELDS,
      ),
    ).toThrowError(expect.objectContaining({ code: 'DUPLICATE_ALIAS' }));
  });

  it('orderBy secilmemis bir alani referans alirsa UNKNOWN_FIELD firlatir', () => {
    expect(() =>
      validateAggregationQuery(
        baseSpec({
          dimensions: [{ field: 'sehir' }],
          orderBy: [{ field: 'tarih', dir: 'asc' }],
        }),
        FIELDS,
      ),
    ).toThrowError(expect.objectContaining({ code: 'UNKNOWN_FIELD' }));
  });

  it('cok boyutlu gruplamayi kabul eder', () => {
    const result = validateAggregationQuery(
      baseSpec({
        dimensions: [
          { field: 'sehir' },
          { field: 'tarih', granularity: 'month' },
        ],
        measures: [{ field: 'tutar', agg: 'sum', alias: 'toplam' }],
      }),
      FIELDS,
    );
    expect(result.outputNames.size).toBe(3);
  });

  it('bos measures+dimensions gecerlidir', () => {
    expect(() => validateAggregationQuery(baseSpec(), FIELDS)).not.toThrow();
  });

  describe('filtre operatorleri', () => {
    it('in bos dizi ile INVALID_FILTER firlatir', () => {
      expect(() =>
        validateAggregationQuery(
          baseSpec({ filters: [{ field: 'sehir', op: 'in', value: [] }] }),
          FIELDS,
        ),
      ).toThrowError(expect.objectContaining({ code: 'INVALID_FILTER' }));
    });

    it('in gecerli dizi ile kabul edilir', () => {
      expect(() =>
        validateAggregationQuery(
          baseSpec({
            filters: [{ field: 'sehir', op: 'in', value: ['Ankara'] }],
          }),
          FIELDS,
        ),
      ).not.toThrow();
    });

    it('nin bos dizi ile INVALID_FILTER firlatir', () => {
      expect(() =>
        validateAggregationQuery(
          baseSpec({ filters: [{ field: 'sehir', op: 'nin', value: [] }] }),
          FIELDS,
        ),
      ).toThrowError(expect.objectContaining({ code: 'INVALID_FILTER' }));
    });

    it('between 2 elemanli olmayan dizi ile INVALID_FILTER firlatir', () => {
      expect(() =>
        validateAggregationQuery(
          baseSpec({
            filters: [{ field: 'tarih', op: 'between', value: [1] }],
          }),
          FIELDS,
        ),
      ).toThrowError(expect.objectContaining({ code: 'INVALID_FILTER' }));
    });

    it('between 2 elemanli dizi ile kabul edilir', () => {
      expect(() =>
        validateAggregationQuery(
          baseSpec({
            filters: [{ field: 'tarih', op: 'between', value: ['a', 'b'] }],
          }),
          FIELDS,
        ),
      ).not.toThrow();
    });

    it.each(['eq', 'neq', 'gt', 'gte', 'lt', 'lte'] as const)(
      '%s deger olmadan INVALID_FILTER firlatir',
      (op) => {
        expect(() =>
          validateAggregationQuery(
            baseSpec({ filters: [{ field: 'tutar', op, value: undefined }] }),
            FIELDS,
          ),
        ).toThrowError(expect.objectContaining({ code: 'INVALID_FILTER' }));
      },
    );

    it('eq skaler deger ile kabul edilir', () => {
      expect(() =>
        validateAggregationQuery(
          baseSpec({ filters: [{ field: 'tutar', op: 'eq', value: 5 }] }),
          FIELDS,
        ),
      ).not.toThrow();
    });

    it('contains metin olmayan alanda INVALID_FILTER firlatir', () => {
      expect(() =>
        validateAggregationQuery(
          baseSpec({
            filters: [{ field: 'tutar', op: 'contains', value: 'a' }],
          }),
          FIELDS,
        ),
      ).toThrowError(expect.objectContaining({ code: 'INVALID_FILTER' }));
    });

    it('contains metin alaninda kabul edilir', () => {
      expect(() =>
        validateAggregationQuery(
          baseSpec({
            filters: [{ field: 'sehir', op: 'contains', value: 'an' }],
          }),
          FIELDS,
        ),
      ).not.toThrow();
    });

    it('contains bos metinle INVALID_FILTER firlatir', () => {
      expect(() =>
        validateAggregationQuery(
          baseSpec({
            filters: [{ field: 'sehir', op: 'contains', value: '' }],
          }),
          FIELDS,
        ),
      ).toThrowError(expect.objectContaining({ code: 'INVALID_FILTER' }));
    });

    it('is_null deger ile gonderilirse INVALID_FILTER firlatir', () => {
      expect(() =>
        validateAggregationQuery(
          baseSpec({ filters: [{ field: 'sehir', op: 'is_null', value: 1 }] }),
          FIELDS,
        ),
      ).toThrowError(expect.objectContaining({ code: 'INVALID_FILTER' }));
    });

    it('is_not_null degersiz kabul edilir', () => {
      expect(() =>
        validateAggregationQuery(
          baseSpec({ filters: [{ field: 'sehir', op: 'is_not_null' }] }),
          FIELDS,
        ),
      ).not.toThrow();
    });
  });
});

describe('validateRowsQuery', () => {
  it('measures/dimensions yok sayilir, filtreler dogrulanir', () => {
    expect(() =>
      validateRowsQuery(
        baseSpec({
          measures: [
            { field: 'yok-olan-alan-ama-onemsiz', agg: 'sum', alias: 'a' },
          ],
          filters: [{ field: 'tutar', op: 'gt', value: 10 }],
        }),
        FIELDS,
      ),
    ).not.toThrow();
  });

  it('bilinmeyen filtre alani UNKNOWN_FIELD firlatir', () => {
    expect(() =>
      validateRowsQuery(
        baseSpec({ filters: [{ field: 'yok', op: 'eq', value: 1 }] }),
        FIELDS,
      ),
    ).toThrowError(expect.objectContaining({ code: 'UNKNOWN_FIELD' }));
  });

  it('orderBy gercek bir alani referans alabilir', () => {
    expect(() =>
      validateRowsQuery(
        baseSpec({ orderBy: [{ field: 'tutar', dir: 'asc' }] }),
        FIELDS,
      ),
    ).not.toThrow();
  });

  it('orderBy bilinmeyen alan icin UNKNOWN_FIELD firlatir', () => {
    expect(() =>
      validateRowsQuery(
        baseSpec({ orderBy: [{ field: 'yok', dir: 'asc' }] }),
        FIELDS,
      ),
    ).toThrowError(expect.objectContaining({ code: 'UNKNOWN_FIELD' }));
  });
});
