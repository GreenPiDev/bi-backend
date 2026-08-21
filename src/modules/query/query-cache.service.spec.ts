import { Readable } from 'node:stream';
import type { Redis } from 'ioredis';
import type { QueryResult } from './dto/query-spec.dto';
import { QueryCacheService } from './query-cache.service';

const TENANT_ID = 't1';
const DATASET_ID = 'd1';

function createRedisMock() {
  return {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    scanStream: vi.fn(),
  };
}

const RESULT: QueryResult = {
  columns: [{ name: 'x', type: 'NUMBER', label: 'X' }],
  rows: [[1]],
  rowCount: 1,
  executionMs: 5,
  truncated: false,
};

describe('QueryCacheService', () => {
  it('cache bos ise null doner', async () => {
    const redis = createRedisMock();
    redis.get.mockResolvedValue(null);
    const service = new QueryCacheService(redis as unknown as Redis);

    const result = await service.get(TENANT_ID, DATASET_ID, 'query', { a: 1 });

    expect(result).toBeNull();
  });

  it('cache doluysa parse edilmis sonucu doner', async () => {
    const redis = createRedisMock();
    redis.get.mockResolvedValue(JSON.stringify(RESULT));
    const service = new QueryCacheService(redis as unknown as Redis);

    const result = await service.get(TENANT_ID, DATASET_ID, 'query', { a: 1 });

    expect(result).toEqual(RESULT);
  });

  it('ayni spec (farkli key sirasiyla) ayni anahtari uretir', async () => {
    const redis = createRedisMock();
    redis.get.mockResolvedValue(null);
    const service = new QueryCacheService(redis as unknown as Redis);

    await service.get(TENANT_ID, DATASET_ID, 'query', { a: 1, b: 2 });
    await service.get(TENANT_ID, DATASET_ID, 'query', { b: 2, a: 1 });

    const [key1] = redis.get.mock.calls[0] as [string];
    const [key2] = redis.get.mock.calls[1] as [string];
    expect(key1).toBe(key2);
  });

  it('farkli dataset icin farkli anahtar uretir', async () => {
    const redis = createRedisMock();
    redis.get.mockResolvedValue(null);
    const service = new QueryCacheService(redis as unknown as Redis);

    await service.get(TENANT_ID, 'd1', 'query', { a: 1 });
    await service.get(TENANT_ID, 'd2', 'query', { a: 1 });

    const [key1] = redis.get.mock.calls[0] as [string];
    const [key2] = redis.get.mock.calls[1] as [string];
    expect(key1).not.toBe(key2);
  });

  it('set TTL 60sn ile EX kullanir', async () => {
    const redis = createRedisMock();
    const service = new QueryCacheService(redis as unknown as Redis);

    await service.set(TENANT_ID, DATASET_ID, 'query', { a: 1 }, RESULT);

    expect(redis.set).toHaveBeenCalledWith(
      expect.stringContaining(`tenant:${TENANT_ID}:query:${DATASET_ID}:query:`),
      JSON.stringify(RESULT),
      'EX',
      60,
    );
  });

  it('invalidateDataset eslesen anahtarlari SCAN+DEL ile siler', async () => {
    const redis = createRedisMock();
    redis.scanStream.mockReturnValue(
      Readable.from([['k1', 'k2'], ['k3']], { objectMode: true }),
    );
    const service = new QueryCacheService(redis as unknown as Redis);

    await service.invalidateDataset(TENANT_ID, DATASET_ID);

    expect(redis.scanStream).toHaveBeenCalledWith({
      match: `tenant:${TENANT_ID}:query:${DATASET_ID}:*`,
      count: 100,
    });
    expect(redis.del).toHaveBeenCalledWith('k1', 'k2');
    expect(redis.del).toHaveBeenCalledWith('k3');
  });

  it('invalidateDataset eslesen anahtar yoksa DEL cagirmaz', async () => {
    const redis = createRedisMock();
    redis.scanStream.mockReturnValue(Readable.from([], { objectMode: true }));
    const service = new QueryCacheService(redis as unknown as Redis);

    await service.invalidateDataset(TENANT_ID, DATASET_ID);

    expect(redis.del).not.toHaveBeenCalled();
  });
});
