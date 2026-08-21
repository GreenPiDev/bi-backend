import { MeasureSpec, QuerySpec } from './query-spec.dto';

describe('QuerySpec', () => {
  it("valid bir spec'i kabul eder", () => {
    const result = QuerySpec.safeParse({
      datasetId: '123e4567-e89b-12d3-a456-426614174000',
      measures: [{ field: 'tutar', agg: 'sum', alias: 'toplam_tutar' }],
      dimensions: [{ field: 'tarih', granularity: 'month' }],
      filters: [],
      orderBy: [],
    });
    expect(result.success).toBe(true);
  });

  it('gecersiz datasetId (uuid degil) reddedilir', () => {
    const result = QuerySpec.safeParse({
      datasetId: 'not-a-uuid',
      measures: [],
      dimensions: [],
      filters: [],
      orderBy: [],
    });
    expect(result.success).toBe(false);
  });

  it('limit varsayilan degeri 1000 olur', () => {
    const parsed = QuerySpec.parse({
      datasetId: '123e4567-e89b-12d3-a456-426614174000',
      measures: [],
      dimensions: [],
      filters: [],
      orderBy: [],
    });
    expect(parsed.limit).toBe(1000);
  });

  it('limit 10000 ustu reddedilir', () => {
    const result = QuerySpec.safeParse({
      datasetId: '123e4567-e89b-12d3-a456-426614174000',
      measures: [],
      dimensions: [],
      filters: [],
      orderBy: [],
      limit: 10001,
    });
    expect(result.success).toBe(false);
  });

  it('alias regex kurallarina uymayan measure reddedilir', () => {
    const result = MeasureSpec.safeParse({
      field: 'x',
      agg: 'sum',
      alias: '1invalid',
    });
    expect(result.success).toBe(false);
  });
});
