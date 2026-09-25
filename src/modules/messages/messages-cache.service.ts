import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import type { PagedResult } from '../../core/dto/list-query.dto';
import { REDIS_CLIENT } from '../../core/redis/redis-client.token';
import { TenantContext } from '../../core/tenant/tenant-context';
import type { ConversationSummary } from './messages.service';

function hashParams(params: unknown): string {
  return createHash('sha256').update(JSON.stringify(params)).digest('hex');
}

/**
 * Mesaj listesi (GET /messages) icin TTL'siz Redis cache -
 * accounts-cache.service.ts ile ayni desen, tek fark: sonuc kullaniciya ozel
 * (kutu/okunmamis sayisi/yildiz userId'ye gore degisir), bu yuzden anahtara
 * tenantId'nin yaninda userId de gomulur (tenant:{id}:messages:list:{userId}:*).
 * invalidate() yine de tum tenant'i temizler - tek bir mesaj birden fazla
 * kullanicinin (gonderen + alicilar) listesini etkileyebilir.
 */
@Injectable()
export class MessagesCacheService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  private buildKey(tenantId: string, userId: string, params: unknown): string {
    return `tenant:${tenantId}:messages:list:${userId}:${hashParams(params)}`;
  }

  async get(
    userId: string,
    params: unknown,
  ): Promise<PagedResult<ConversationSummary> | null> {
    const { tenantId } = TenantContext.getOrThrow();
    const raw = await this.redis.get(this.buildKey(tenantId, userId, params));
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as PagedResult<ConversationSummary>;
  }

  async set(
    userId: string,
    params: unknown,
    result: PagedResult<ConversationSummary>,
  ): Promise<void> {
    const { tenantId } = TenantContext.getOrThrow();
    await this.redis.set(
      this.buildKey(tenantId, userId, params),
      JSON.stringify(result),
    );
  }

  async invalidate(): Promise<void> {
    const { tenantId } = TenantContext.getOrThrow();
    const pattern = `tenant:${tenantId}:messages:list:*`;
    const stream = this.redis.scanStream({ match: pattern, count: 100 });
    for await (const keys of stream as AsyncIterable<string[]>) {
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    }
  }
}
