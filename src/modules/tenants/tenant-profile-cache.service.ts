import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../../core/redis/redis-client.token';
import type { TenantProfile } from './tenants.service';

/**
 * Sirket profili (GET /tenants/me) icin TTL'siz Redis cache - diger *-cache.service.ts
 * dosyalariyla ayni desen, tek fark: tek bir tenant'in tek bir kaydi oldugu icin
 * parametre hash'i yerine dogrudan tenantId anahtara gomulur (tenant:{id}:profile).
 * updateCompanyInfo/uploadLogo/removeLogo bu kaydi degistiren tek 3 yer - her biri
 * `invalidate()` cagirir.
 */
@Injectable()
export class TenantProfileCacheService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  private buildKey(tenantId: string): string {
    return `tenant:${tenantId}:profile`;
  }

  async get(tenantId: string): Promise<TenantProfile | null> {
    const raw = await this.redis.get(this.buildKey(tenantId));
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as TenantProfile;
  }

  async set(tenantId: string, result: TenantProfile): Promise<void> {
    await this.redis.set(this.buildKey(tenantId), JSON.stringify(result));
  }

  async invalidate(tenantId: string): Promise<void> {
    await this.redis.del(this.buildKey(tenantId));
  }
}
