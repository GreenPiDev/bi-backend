import type { DatasetField } from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import type { QueryResult } from './dto/query-spec.dto';
import { QueryService } from './query.service';

const DATASET_ID = '11111111-1111-1111-1111-111111111111';
const TENANT_ID = '22222222-2222-2222-2222-222222222222';

function field(overrides: Partial<DatasetField>): DatasetField {
  return {
    id: 'f',
    datasetId: DATASET_ID,
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
  field({
    name: 'sehir',
    label: 'Sehir',
    type: 'STRING',
    role: 'DIMENSION',
    ordinal: 0,
  }),
  field({
    name: 'tutar',
    label: 'Tutar',
    type: 'NUMBER',
    role: 'MEASURE',
    ordinal: 1,
  }),
];

function createPrisma(dataset: unknown = { id: DATASET_ID, fields: FIELDS }) {
  return { dataset: { findFirst: vi.fn().mockResolvedValue(dataset) } };
}

function createQuerySql(rows: Record<string, unknown>[] = []) {
  return { execute: vi.fn().mockResolvedValue(rows) };
}

function createQueryCache(cached: QueryResult | null = null) {
  return {
    get: vi.fn().mockResolvedValue(cached),
    set: vi.fn().mockResolvedValue(undefined),
  };
}

function baseSpec(overrides: Record<string, unknown> = {}) {
  return {
    datasetId: DATASET_ID,
    measures: [],
    dimensions: [],
    filters: [],
    orderBy: [],
    limit: 1000,
    ...overrides,
  };
}

describe('QueryService.runQuery', () => {
  it('dataset bulunamazsa NOT_FOUND firlatir', async () => {
    const prisma = createPrisma(null);
    const service = new QueryService(
      prisma as never,
      createQuerySql() as never,
      createQueryCache() as never,
    );
    await expect(
      service.runQuery(baseSpec() as never, TENANT_ID),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<AppException>);
  });

  it('cache hit ise sorgu calistirilmadan cache sonucu doner', async () => {
    const cached: QueryResult = {
      columns: [],
      rows: [],
      rowCount: 0,
      executionMs: 1,
      truncated: false,
    };
    const prisma = createPrisma();
    const querySql = createQuerySql();
    const service = new QueryService(
      prisma as never,
      querySql as never,
      createQueryCache(cached) as never,
    );
    const result = await service.runQuery(baseSpec() as never, TENANT_ID);
    expect(result).toBe(cached);
    expect(querySql.execute).not.toHaveBeenCalled();
  });

  it('cache miss ise sorgu calisir, sonuc cache lenir', async () => {
    const prisma = createPrisma();
    const querySql = createQuerySql([{ sehir: 'Ankara', toplam: 100 }]);
    const queryCache = createQueryCache(null);
    const service = new QueryService(
      prisma as never,
      querySql as never,
      queryCache as never,
    );

    const result = await service.runQuery(
      baseSpec({
        dimensions: [{ field: 'sehir' }],
        measures: [{ field: 'tutar', agg: 'sum', alias: 'toplam' }],
      }) as never,
      TENANT_ID,
    );

    expect(result.rows).toEqual([['Ankara', 100]]);
    expect(result.columns.map((c) => c.name)).toEqual(['sehir', 'toplam']);
    expect(result.rowCount).toBe(1);
    expect(result.truncated).toBe(false);
    expect(queryCache.set).toHaveBeenCalledWith(
      TENANT_ID,
      DATASET_ID,
      'query',
      expect.anything(),
      result,
    );
  });

  it('donen satir sayisi limit+1 ise truncated true olur ve fazla satir kirpilir', async () => {
    const prisma = createPrisma();
    const querySql = createQuerySql([{ sehir: 'Ankara' }, { sehir: 'Izmir' }]);
    const service = new QueryService(
      prisma as never,
      querySql as never,
      createQueryCache(null) as never,
    );

    const result = await service.runQuery(
      baseSpec({ dimensions: [{ field: 'sehir' }], limit: 1 }) as never,
      TENANT_ID,
    );

    expect(result.truncated).toBe(true);
    expect(result.rowCount).toBe(1);
    expect(result.rows).toEqual([['Ankara']]);
  });

  it('gecersiz alan icin sorgu calistirilmadan hata firlatir', async () => {
    const prisma = createPrisma();
    const querySql = createQuerySql();
    const service = new QueryService(
      prisma as never,
      querySql as never,
      createQueryCache(null) as never,
    );

    await expect(
      service.runQuery(
        baseSpec({
          measures: [{ field: 'yok', agg: 'sum', alias: 'a' }],
        }) as never,
        TENANT_ID,
      ),
    ).rejects.toMatchObject({
      code: 'UNKNOWN_FIELD',
    } satisfies Partial<AppException>);
    expect(querySql.execute).not.toHaveBeenCalled();
  });
});

describe('QueryService.runRowsQuery', () => {
  it('gorunur alanlari secer ve cache e yazar', async () => {
    const prisma = createPrisma();
    const querySql = createQuerySql([{ sehir: 'Ankara', tutar: 10 }]);
    const queryCache = createQueryCache(null);
    const service = new QueryService(
      prisma as never,
      querySql as never,
      queryCache as never,
    );

    const result = await service.runRowsQuery(baseSpec() as never, TENANT_ID);

    expect(result.columns.map((c) => c.name)).toEqual(['sehir', 'tutar']);
    expect(result.rows).toEqual([['Ankara', 10]]);
    expect(queryCache.set).toHaveBeenCalledWith(
      TENANT_ID,
      DATASET_ID,
      'rows',
      expect.anything(),
      result,
    );
  });
});
