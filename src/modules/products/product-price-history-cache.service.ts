import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../../core/redis/redis-client.token';
import { TenantContext } from '../../core/tenant/tenant-context';
import type { ProductPriceMovementView } from './products.service';

/**
 * Fiyat Gecmisi (/envanter?tab=priceHistory, satir genisletildiginde) icin TTL'siz
 * Redis cache - ProductsCacheService ile ayni desen, ama anahtar urun bazinda
 * ayrildigi icin bir urunun fiyati degisince sadece o urunun cache'i invalidate
 * olur, ayni tenant'taki diger urunlerin fiyat gecmisi cache'i etkilenmez. Sadece
 * tek-urun sorgusu (productId verilmis, userId verilmemis - UI'ın kullandigi tek
 * yol) cache'lenir; productId'siz/userId'li genel listeleme dogrudan DB'den okunur.
 */
@Injectable()
export class ProductPriceHistoryCacheService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  private buildKey(tenantId: string, productId: string): string {
    return `tenant:${tenantId}:products:price-history:${productId}`;
  }

  async get(productId: string): Promise<ProductPriceMovementView[] | null> {
    const { tenantId } = TenantContext.getOrThrow();
    const raw = await this.redis.get(this.buildKey(tenantId, productId));
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as ProductPriceMovementView[];
  }

  async set(
    productId: string,
    result: ProductPriceMovementView[],
  ): Promise<void> {
    const { tenantId } = TenantContext.getOrThrow();
    await this.redis.set(
      this.buildKey(tenantId, productId),
      JSON.stringify(result),
    );
  }

  async invalidate(productId: string): Promise<void> {
    const { tenantId } = TenantContext.getOrThrow();
    await this.redis.del(this.buildKey(tenantId, productId));
  }
}
