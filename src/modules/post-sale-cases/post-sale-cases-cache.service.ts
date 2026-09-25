import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import type { PagedResult } from '../../core/dto/list-query.dto';
import { REDIS_CLIENT } from '../../core/redis/redis-client.token';
import { TenantContext } from '../../core/tenant/tenant-context';
import type { PostSaleCaseWithDetails } from './post-sale-cases.service';

function hashParams(params: unknown): string {
  return createHash('sha256').update(JSON.stringify(params)).digest('hex');
}

/**
 * Satis sonrasi listesi (GET /post-sale-cases) icin TTL'siz Redis cache -
 * accounts-cache.service.ts ile ayni desen: ayni ioredis client'i paylasir,
 * ayri bir anahtar namespace'i kullanir (tenant:{id}:post-sale-cases:list:*).
 * S1/S2/S3 tetikleyicileri (Quote onayi, gecikmis hatirlatma taramasi, anket
 * gonderimi) tenant-scoped bir istek baglaminda calismayabilir (BullMQ cron
 * job'lari, bkz. check-post-sale-followup.processor.ts) - bu yuzden invalidate()
 * TenantContext'e bagimliyken, invalidateForTenant(tenantId) bu context'siz
 * yerler icin ayrica saglanir.
 */
@Injectable()
export class PostSaleCasesCacheService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  private buildKey(tenantId: string, params: unknown): string {
    return `tenant:${tenantId}:post-sale-cases:list:${hashParams(params)}`;
  }

  async get(
    params: unknown,
  ): Promise<PagedResult<PostSaleCaseWithDetails> | null> {
    const { tenantId } = TenantContext.getOrThrow();
    const raw = await this.redis.get(this.buildKey(tenantId, params));
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as PagedResult<PostSaleCaseWithDetails>;
  }

  async set(
    params: unknown,
    result: PagedResult<PostSaleCaseWithDetails>,
  ): Promise<void> {
    const { tenantId } = TenantContext.getOrThrow();
    await this.redis.set(
      this.buildKey(tenantId, params),
      JSON.stringify(result),
    );
  }

  async invalidate(): Promise<void> {
    const { tenantId } = TenantContext.getOrThrow();
    await this.invalidateForTenant(tenantId);
  }

  async invalidateForTenant(tenantId: string): Promise<void> {
    const pattern = `tenant:${tenantId}:post-sale-cases:list:*`;
    const stream = this.redis.scanStream({ match: pattern, count: 100 });
    for await (const keys of stream as AsyncIterable<string[]>) {
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    }
  }
}
