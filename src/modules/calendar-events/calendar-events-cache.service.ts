import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../../core/redis/redis-client.token';
import { TenantContext } from '../../core/tenant/tenant-context';
import type {
  CalendarEventWithAttendees,
  PendingCalendarInvite,
} from './calendar-events.service';

function hashParams(params: unknown): string {
  return createHash('sha256').update(JSON.stringify(params)).digest('hex');
}

/**
 * Ajanda listesi (GET /calendar-events) icin TTL'siz Redis cache -
 * accounts-cache.service.ts ile ayni desen: ayni ioredis client'i paylasir,
 * ayri bir anahtar namespace'i kullanir (tenant:{id}:calendar-events:list:*).
 * TenantContext'ten okunan tenantId anahtara gomuldugu icin bir tenant'taki
 * mutasyon sadece o tenant'in anahtarlarini invalidate eder, digerlerini etkilemez.
 *
 * Bekleyen davetler (GET /calendar-events/pending-invites) de ayni servisten,
 * ama kullaniciya ozel bir anahtarla (tenant:{id}:calendar-events:pending-invites:{userId})
 * cache'lenir - `invalidate()` zaten create/update/delete/respond'un hepsinde
 * cagrildigi icin (bu dort islem de kimin davetli oldugunu degistirebilir)
 * ayrica bir invalidation noktasi eklemeye gerek yok, sadece suruculen pattern
 * genisletildi.
 */
@Injectable()
export class CalendarEventsCacheService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  private buildKey(tenantId: string, params: unknown): string {
    return `tenant:${tenantId}:calendar-events:list:${hashParams(params)}`;
  }

  private buildPendingInvitesKey(tenantId: string, userId: string): string {
    return `tenant:${tenantId}:calendar-events:pending-invites:${userId}`;
  }

  async get(params: unknown): Promise<CalendarEventWithAttendees[] | null> {
    const { tenantId } = TenantContext.getOrThrow();
    const raw = await this.redis.get(this.buildKey(tenantId, params));
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as CalendarEventWithAttendees[];
  }

  async set(
    params: unknown,
    result: CalendarEventWithAttendees[],
  ): Promise<void> {
    const { tenantId } = TenantContext.getOrThrow();
    await this.redis.set(
      this.buildKey(tenantId, params),
      JSON.stringify(result),
    );
  }

  async getPendingInvites(
    userId: string,
  ): Promise<PendingCalendarInvite[] | null> {
    const { tenantId } = TenantContext.getOrThrow();
    const raw = await this.redis.get(
      this.buildPendingInvitesKey(tenantId, userId),
    );
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as PendingCalendarInvite[];
  }

  async setPendingInvites(
    userId: string,
    result: PendingCalendarInvite[],
  ): Promise<void> {
    const { tenantId } = TenantContext.getOrThrow();
    await this.redis.set(
      this.buildPendingInvitesKey(tenantId, userId),
      JSON.stringify(result),
    );
  }

  async invalidate(): Promise<void> {
    const { tenantId } = TenantContext.getOrThrow();
    const pattern = `tenant:${tenantId}:calendar-events:*`;
    const stream = this.redis.scanStream({ match: pattern, count: 100 });
    for await (const keys of stream as AsyncIterable<string[]>) {
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    }
  }
}
