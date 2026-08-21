import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../../core/redis/redis-client.token';
import type { QueryResult } from './dto/query-spec.dto';

const CACHE_TTL_SECONDS = 60;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === 'object') {
    const sortedKeys = Object.keys(value as Record<string, unknown>).sort();
    const out: Record<string, unknown> = {};
    for (const key of sortedKeys) {
      out[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

function hashSpec(spec: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(spec)))
    .digest('hex');
}

/**
 * CLAUDE.md SS6: sonuclar tenant:{id}:query:{querySpecHash} altinda 60sn
 * cache'lenir. datasetId anahtarda ayri tutulur ki dataset bazli toplu
 * invalidation (schema editoru kolon degisikligi) mumkun olsun.
 */
@Injectable()
export class QueryCacheService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  private buildKey(
    tenantId: string,
    datasetId: string,
    endpoint: 'query' | 'rows',
    spec: unknown,
  ): string {
    return `tenant:${tenantId}:query:${datasetId}:${endpoint}:${hashSpec(spec)}`;
  }

  async get(
    tenantId: string,
    datasetId: string,
    endpoint: 'query' | 'rows',
    spec: unknown,
  ): Promise<QueryResult | null> {
    const raw = await this.redis.get(
      this.buildKey(tenantId, datasetId, endpoint, spec),
    );
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as QueryResult;
  }

  async set(
    tenantId: string,
    datasetId: string,
    endpoint: 'query' | 'rows',
    spec: unknown,
    result: QueryResult,
  ): Promise<void> {
    await this.redis.set(
      this.buildKey(tenantId, datasetId, endpoint, spec),
      JSON.stringify(result),
      'EX',
      CACHE_TTL_SECONDS,
    );
  }

  async invalidateDataset(tenantId: string, datasetId: string): Promise<void> {
    const pattern = `tenant:${tenantId}:query:${datasetId}:*`;
    const stream = this.redis.scanStream({ match: pattern, count: 100 });
    for await (const keys of stream as AsyncIterable<string[]>) {
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    }
  }
}
