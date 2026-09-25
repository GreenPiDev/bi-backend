import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import type { PagedResult } from '../../core/dto/list-query.dto';
import { REDIS_CLIENT } from '../../core/redis/redis-client.token';
import { TenantContext } from '../../core/tenant/tenant-context';
import type { PurchaseOrderWithItems } from './purchase-orders.service';

function hashParams(params: unknown): string {
  return createHash('sha256').update(JSON.stringify(params)).digest('hex');
}

/**
 * Siparis listesi (GET /purchase-orders) icin TTL'siz Redis cache -
 * accounts-cache.service.ts ile ayni desen: ayni ioredis client'i paylasir,
 * ayri bir anahtar namespace'i kullanir (tenant:{id}:purchase-orders:list:*).
 * TenantContext'ten okunan tenantId anahtara gomuldugu icin bir tenant'taki
 * mutasyon sadece o tenant'in anahtarlarini invalidate eder, digerlerini etkilemez.
 */
@Injectable()
export class PurchaseOrdersCacheService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  private buildKey(tenantId: string, params: unknown): string {
    return `tenant:${tenantId}:purchase-orders:list:${hashParams(params)}`;
  }

  async get(
    params: unknown,
  ): Promise<PagedResult<PurchaseOrderWithItems> | null> {
    const { tenantId } = TenantContext.getOrThrow();
    const raw = await this.redis.get(this.buildKey(tenantId, params));
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as PagedResult<PurchaseOrderWithItems>;
  }

  async set(
    params: unknown,
    result: PagedResult<PurchaseOrderWithItems>,
  ): Promise<void> {
    const { tenantId } = TenantContext.getOrThrow();
    await this.redis.set(
      this.buildKey(tenantId, params),
      JSON.stringify(result),
    );
  }

  async invalidate(): Promise<void> {
    const { tenantId } = TenantContext.getOrThrow();
    const pattern = `tenant:${tenantId}:purchase-orders:list:*`;
    const stream = this.redis.scanStream({ match: pattern, count: 100 });
    for await (const keys of stream as AsyncIterable<string[]>) {
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    }
  }
}
