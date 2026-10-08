import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import type { PagedResult } from '../../core/dto/list-query.dto';
import { REDIS_CLIENT } from '../../core/redis/redis-client.token';
import { TenantContext } from '../../core/tenant/tenant-context';
import type { ProductListItem } from './products.service';
import type { StockItemWithProduct } from '../stock-items/stock-items.service';

function hashParams(params: unknown): string {
  return createHash('sha256').update(JSON.stringify(params)).digest('hex');
}

/**
 * Urun listesi (GET /products) icin TTL'siz Redis cache -
 * accounts-cache.service.ts ile ayni desen: ayni ioredis client'i paylasir,
 * ayri bir anahtar namespace'i kullanir (tenant:{id}:products:list:*).
 * TenantContext'ten okunan tenantId anahtara gomuldugu icin bir tenant'taki
 * mutasyon sadece o tenant'in anahtarlarini invalidate eder, digerlerini etkilemez.
 *
 * Dusuk stok listesi (GET /stock-items/low-stock, ST1) de kasitli olarak BURADA
 * cache'lenir, stock-items modulunde degil: sonuc kumesi hem Product alanlarina
 * (minStockLevel) hem StockItem miktarlarina bagli, ve StockItemsModule zaten
 * ProductsModule'u import ediyor (bkz. stock-items.module.ts) - tersi bir bagimlilik
 * (ProductsModule -> StockItemsModule) dairesel import'a yol acardi. Bu sayede
 * ProductsService.create/update/remove VE StockItemsService.increase/decrease/
 * transferStock'un zaten her ikisinin de cagirdigi `invalidate()` tek bir
 * yerden hem urun listesini hem dusuk stok listesini temizliyor.
 */
@Injectable()
export class ProductsCacheService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  private buildKey(tenantId: string, params: unknown): string {
    return `tenant:${tenantId}:products:list:${hashParams(params)}`;
  }

  private buildLowStockKey(tenantId: string): string {
    return `tenant:${tenantId}:products:low-stock`;
  }

  async get(params: unknown): Promise<PagedResult<ProductListItem> | null> {
    const { tenantId } = TenantContext.getOrThrow();
    const raw = await this.redis.get(this.buildKey(tenantId, params));
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as PagedResult<ProductListItem>;
  }

  async set(
    params: unknown,
    result: PagedResult<ProductListItem>,
  ): Promise<void> {
    const { tenantId } = TenantContext.getOrThrow();
    await this.redis.set(
      this.buildKey(tenantId, params),
      JSON.stringify(result),
    );
  }

  async getLowStock(): Promise<StockItemWithProduct[] | null> {
    const { tenantId } = TenantContext.getOrThrow();
    const raw = await this.redis.get(this.buildLowStockKey(tenantId));
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as StockItemWithProduct[];
  }

  async setLowStock(result: StockItemWithProduct[]): Promise<void> {
    const { tenantId } = TenantContext.getOrThrow();
    await this.redis.set(
      this.buildLowStockKey(tenantId),
      JSON.stringify(result),
    );
  }

  async invalidate(): Promise<void> {
    const { tenantId } = TenantContext.getOrThrow();
    await this.redis.del(this.buildLowStockKey(tenantId));
    const pattern = `tenant:${tenantId}:products:list:*`;
    const stream = this.redis.scanStream({ match: pattern, count: 100 });
    for await (const keys of stream as AsyncIterable<string[]>) {
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    }
  }
}
