import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import type { PagedResult } from '../../core/dto/list-query.dto';
import { REDIS_CLIENT } from '../../core/redis/redis-client.token';
import { TenantContext } from '../../core/tenant/tenant-context';
import type { AccountWithMeta } from './accounts.service';

function hashParams(params: unknown): string {
  return createHash('sha256').update(JSON.stringify(params)).digest('hex');
}

/**
 * Firma listesi (GET /accounts) icin TTL'siz Redis cache - query-cache.service.ts'teki
 * QueryCacheService ile ayni ioredis client'ini paylasir ama ayri bir anahtar
 * namespace'i kullanir (tenant:{id}:accounts:list:*). Sure sinirli degil, sadece
 * Account CRUD veya toplu ice aktarma sonrasi invalidate edilince tazelenir -
 * kullanici karari: liste sik degismiyor, silme/duzenleme/ekleme sonrasinda taze
 * veri gormek yeterli.
 */
@Injectable()
export class AccountsCacheService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  private buildKey(tenantId: string, params: unknown): string {
    return `tenant:${tenantId}:accounts:list:${hashParams(params)}`;
  }

  async get(params: unknown): Promise<PagedResult<AccountWithMeta> | null> {
    const { tenantId } = TenantContext.getOrThrow();
    const raw = await this.redis.get(this.buildKey(tenantId, params));
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as PagedResult<AccountWithMeta>;
  }

  async set(
    params: unknown,
    result: PagedResult<AccountWithMeta>,
  ): Promise<void> {
    const { tenantId } = TenantContext.getOrThrow();
    await this.redis.set(
      this.buildKey(tenantId, params),
      JSON.stringify(result),
    );
  }

  async invalidate(): Promise<void> {
    const { tenantId } = TenantContext.getOrThrow();
    const pattern = `tenant:${tenantId}:accounts:list:*`;
    const stream = this.redis.scanStream({ match: pattern, count: 100 });
    for await (const keys of stream as AsyncIterable<string[]>) {
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    }
  }
}
