import type { DatasetField } from '@prisma/client';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { QuerySpec } from './dto/query-spec.dto';
import { buildAggregationQuery, buildRowsQuery } from './query-builder';
import { buildFieldMap } from './query-validation';

type AnyDb = Record<string, never>;

const db = new Kysely<AnyDb>({
  dialect: new PostgresDialect({
    pool: new Pool({ connectionString: 'postgres://x:x@localhost:1/x' }),
  }),
});

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const DATASET_ID = '22222222-2222-2222-2222-222222222222';

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
  field({
    name: 'tarih',
    label: 'Tarih',
    type: 'DATE',
    role: 'DATE',
    ordinal: 2,
  }),
  field({
    name: 'gizli',
    label: 'Gizli',
    type: 'STRING',
    role: 'DIMENSION',
    ordinal: 3,
    isVisible: false,
  }),
];

function baseSpec(overrides: Partial<QuerySpec> = {}): QuerySpec {
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

function compile(raw: {
  compile: (db: Kysely<AnyDb>) => {
    sql: string;
    parameters: readonly unknown[];
  };
}) {
  return raw.compile(db);
}

describe('buildAggregationQuery', () => {
  it('boyut + olcu ile group by uretir', () => {
    const spec = baseSpec({
      dimensions: [{ field: 'sehir' }],
      measures: [{ field: 'tutar', agg: 'sum', alias: 'toplam' }],
    });
    const { raw, columns } = buildAggregationQuery(
      spec,
      buildFieldMap(FIELDS),
      FIELDS,
      TENANT_ID,
    );
    const compiled = compile(raw);
    expect(compiled.sql).toContain(
      'select "sehir" as "sehir", sum("tutar") as "toplam"',
    );
    expect(compiled.sql).toContain('group by "sehir"');
    expect(compiled.sql).toMatch(/from "tenant_1{8,}"\."ds_2{8,}"/);
    expect(columns).toEqual([
      { name: 'sehir', type: 'STRING', label: 'Sehir' },
      { name: 'toplam', type: 'NUMBER', label: 'toplam' },
    ]);
  });

  it('limit spec.limit + 1 olarak parametrelenir', () => {
    const spec = baseSpec({ limit: 50 });
    const { raw } = buildAggregationQuery(
      spec,
      buildFieldMap(FIELDS),
      FIELDS,
      TENANT_ID,
    );
    const compiled = compile(raw);
    expect(compiled.parameters.at(-1)).toBe(51);
  });

  it('granularity date_trunc uretir', () => {
    const spec = baseSpec({
      dimensions: [{ field: 'tarih', granularity: 'month' }],
    });
    const { raw, columns } = buildAggregationQuery(
      spec,
      buildFieldMap(FIELDS),
      FIELDS,
      TENANT_ID,
    );
    const compiled = compile(raw);
    // granularity literal olarak gomulur (bind parametresi degil); boylece
    // SELECT ve GROUP BY'daki ayni ifade, Postgres tarafindan ayni ifade
    // olarak taninir (bkz. asagidaki "select/group by/order by ayni
    // date_trunc ifadesini uretir" testi).
    expect(compiled.sql).toContain('date_trunc(\'month\', "tarih")');
    expect(compiled.parameters).not.toContain('month');
    expect(columns[0]).toEqual({ name: 'tarih', type: 'DATE', label: 'Tarih' });
  });

  it('granularity ile aynı boyuta gore siralama, select pozisyonuna gore siralar (raw kolona degil)', () => {
    const spec = baseSpec({
      dimensions: [{ field: 'tarih', granularity: 'month' }],
      orderBy: [{ field: 'tarih', dir: 'asc' }],
    });
    const { raw } = buildAggregationQuery(
      spec,
      buildFieldMap(FIELDS),
      FIELDS,
      TENANT_ID,
    );
    const compiled = compile(raw);
    // ORDER BY, date_trunc(...) ifadesini parametreleyerek tekrar gomerse
    // Postgres bunu GROUP BY ifadesiyle ayni kabul etmez (farkli parametre
    // dugumleri olusur). Bunun yerine select listesindeki 1-tabanli
    // pozisyona (burada 1. kolon) gore siralamali.
    expect(compiled.sql).toMatch(/order by 1 asc/);
    expect(compiled.sql).not.toMatch(/order by date_trunc/);
  });

  it('olcu aliasina gore siralama select pozisyonuna gore siralar', () => {
    const spec = baseSpec({
      dimensions: [{ field: 'sehir' }],
      measures: [{ field: 'tutar', agg: 'sum', alias: 'toplam' }],
      orderBy: [{ field: 'toplam', dir: 'desc' }],
    });
    const { raw } = buildAggregationQuery(
      spec,
      buildFieldMap(FIELDS),
      FIELDS,
      TENANT_ID,
    );
    const compiled = compile(raw);
    // sehir 1. kolon, toplam 2. kolon.
    expect(compiled.sql).toMatch(/order by 2 desc/);
  });

  it('filtreler AND ile birlestirilir', () => {
    const spec = baseSpec({
      filters: [
        { field: 'tutar', op: 'gt', value: 100 },
        { field: 'sehir', op: 'eq', value: 'Ankara' },
      ],
    });
    const { raw } = buildAggregationQuery(
      spec,
      buildFieldMap(FIELDS),
      FIELDS,
      TENANT_ID,
    );
    const compiled = compile(raw);
    expect(compiled.sql).toContain('"tutar" > $1 and "sehir" = $2');
    expect(compiled.parameters).toEqual([100, 'Ankara', 1001]);
  });

  it('in operatoru IN listesi uretir', () => {
    const spec = baseSpec({
      filters: [{ field: 'sehir', op: 'in', value: ['Ankara', 'Izmir'] }],
    });
    const { raw } = buildAggregationQuery(
      spec,
      buildFieldMap(FIELDS),
      FIELDS,
      TENANT_ID,
    );
    const compiled = compile(raw);
    expect(compiled.sql).toContain('"sehir" IN ($1, $2)');
    expect(compiled.parameters.slice(0, 2)).toEqual(['Ankara', 'Izmir']);
  });

  it('nin operatoru NOT IN uretir', () => {
    const spec = baseSpec({
      filters: [{ field: 'sehir', op: 'nin', value: ['Ankara'] }],
    });
    const { raw } = buildAggregationQuery(
      spec,
      buildFieldMap(FIELDS),
      FIELDS,
      TENANT_ID,
    );
    expect(compile(raw).sql).toContain('"sehir" NOT IN ($1)');
  });

  it('between BETWEEN...AND uretir', () => {
    const spec = baseSpec({
      filters: [
        { field: 'tarih', op: 'between', value: ['2026-01-01', '2026-02-01'] },
      ],
    });
    const { raw } = buildAggregationQuery(
      spec,
      buildFieldMap(FIELDS),
      FIELDS,
      TENANT_ID,
    );
    const compiled = compile(raw);
    expect(compiled.sql).toContain('"tarih" BETWEEN $1 AND $2');
    expect(compiled.parameters.slice(0, 2)).toEqual([
      '2026-01-01',
      '2026-02-01',
    ]);
  });

  it('contains ILIKE ile %deger% uretir', () => {
    const spec = baseSpec({
      filters: [{ field: 'sehir', op: 'contains', value: 'ank' }],
    });
    const { raw } = buildAggregationQuery(
      spec,
      buildFieldMap(FIELDS),
      FIELDS,
      TENANT_ID,
    );
    const compiled = compile(raw);
    expect(compiled.sql).toContain('"sehir" ILIKE $1');
    expect(compiled.parameters[0]).toBe('%ank%');
  });

  it('is_null / is_not_null deger almadan uretilir', () => {
    const spec = baseSpec({
      filters: [
        { field: 'sehir', op: 'is_null' },
        { field: 'tarih', op: 'is_not_null' },
      ],
    });
    const { raw } = buildAggregationQuery(
      spec,
      buildFieldMap(FIELDS),
      FIELDS,
      TENANT_ID,
    );
    const compiled = compile(raw);
    expect(compiled.sql).toContain('"sehir" IS NULL and "tarih" IS NOT NULL');
  });

  it('orderBy asc/desc uretir', () => {
    const spec = baseSpec({
      dimensions: [{ field: 'sehir' }],
      orderBy: [{ field: 'sehir', dir: 'desc' }],
    });
    const { raw } = buildAggregationQuery(
      spec,
      buildFieldMap(FIELDS),
      FIELDS,
      TENANT_ID,
    );
    expect(compile(raw).sql).toContain('order by 1 desc');
  });

  it('bos measures+dimensions gorunur alanlarla ham satir listesine duser', () => {
    const spec = baseSpec();
    const { raw, columns } = buildAggregationQuery(
      spec,
      buildFieldMap(FIELDS),
      FIELDS,
      TENANT_ID,
    );
    const compiled = compile(raw);
    expect(compiled.sql).not.toContain('group by');
    expect(columns.map((c) => c.name)).toEqual(['sehir', 'tutar', 'tarih']);
  });

  it('count_distinct uretir', () => {
    const spec = baseSpec({
      measures: [{ field: 'sehir', agg: 'count_distinct', alias: 'adet' }],
    });
    const { raw } = buildAggregationQuery(
      spec,
      buildFieldMap(FIELDS),
      FIELDS,
      TENANT_ID,
    );
    expect(compile(raw).sql).toContain('count(distinct "sehir") as "adet"');
  });

  it('cok boyutlu gruplama tum boyutlari group by ekler', () => {
    const spec = baseSpec({
      dimensions: [{ field: 'sehir' }, { field: 'tarih', granularity: 'year' }],
      measures: [{ field: 'tutar', agg: 'avg', alias: 'ortalama' }],
    });
    const { raw } = buildAggregationQuery(
      spec,
      buildFieldMap(FIELDS),
      FIELDS,
      TENANT_ID,
    );
    const compiled = compile(raw);
    expect(compiled.sql).toContain(
      'group by "sehir", date_trunc(\'year\', "tarih")',
    );
  });
});

describe('buildRowsQuery', () => {
  it('gorunmeyen alanlari haric tutar', () => {
    const spec = baseSpec();
    const { raw, columns } = buildRowsQuery(
      spec,
      buildFieldMap(FIELDS),
      FIELDS,
      TENANT_ID,
    );
    expect(columns.map((c) => c.name)).toEqual(['sehir', 'tutar', 'tarih']);
    expect(compile(raw).sql).not.toContain('"gizli"');
  });

  it('measures/dimensions gonderilse bile yok sayilir', () => {
    const spec = baseSpec({
      measures: [{ field: 'tutar', agg: 'sum', alias: 'x' }],
    });
    const { raw } = buildRowsQuery(
      spec,
      buildFieldMap(FIELDS),
      FIELDS,
      TENANT_ID,
    );
    expect(compile(raw).sql).not.toContain('sum(');
  });

  it('filtre ve limit uygular', () => {
    const spec = baseSpec({
      filters: [{ field: 'tutar', op: 'gte', value: 10 }],
      limit: 5,
    });
    const { raw } = buildRowsQuery(
      spec,
      buildFieldMap(FIELDS),
      FIELDS,
      TENANT_ID,
    );
    const compiled = compile(raw);
    expect(compiled.sql).toContain('"tutar" >= $1');
    expect(compiled.parameters.at(-1)).toBe(6);
  });
});
