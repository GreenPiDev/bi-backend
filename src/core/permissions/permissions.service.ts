import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis-client.token';
import { PrismaService } from '../prisma/prisma.service';
import type { EffectivePermissionSet } from './permission.types';

const CACHE_TTL_SECONDS = 300;

interface CachedRole {
  isCompanyAdmin: boolean;
  permissions: { pageKey: string; tabKey: string | null; action: string }[];
}

/**
 * Bir kullanicinin coklu rolunden (bkz. docs/PLAN_ROL_YONETIMI.md SS0) tekil, birlesik
 * (union) bir izin kumesi hesaplar. Rol basina Redis'te `tenant:{id}:role-permissions:{roleId}`
 * anahtariyla 5 dk cache'lenir; RolesService bir rolu guncelleyip/silince bu anahtar
 * invalidate edilir (bkz. modules/roles/roles.service.ts).
 */
@Injectable()
export class PermissionsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  private cacheKey(tenantId: string, roleId: string): string {
    return `tenant:${tenantId}:role-permissions:${roleId}`;
  }

  private async loadRole(
    tenantId: string,
    roleId: string,
  ): Promise<CachedRole> {
    const cacheKey = this.cacheKey(tenantId, roleId);
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as CachedRole;
    }

    const role = await this.prisma.role.findFirst({
      where: { id: roleId, tenantId },
      include: { permissions: true },
    });
    const result: CachedRole = role
      ? {
          isCompanyAdmin: role.isCompanyAdmin,
          permissions: role.permissions.map((p) => ({
            pageKey: p.pageKey,
            tabKey: p.tabKey,
            action: p.action,
          })),
        }
      : { isCompanyAdmin: false, permissions: [] };

    await this.redis.set(
      cacheKey,
      JSON.stringify(result),
      'EX',
      CACHE_TTL_SECONDS,
    );
    return result;
  }

  async getEffectivePermissions(
    tenantId: string,
    roleIds: string[],
  ): Promise<EffectivePermissionSet> {
    if (roleIds.length === 0) {
      return { isCompanyAdmin: false, permissions: [] };
    }
    const roles = await Promise.all(
      roleIds.map((roleId) => this.loadRole(tenantId, roleId)),
    );
    return {
      isCompanyAdmin: roles.some((r) => r.isCompanyAdmin),
      permissions: roles.flatMap(
        (r) => r.permissions,
      ) as EffectivePermissionSet['permissions'],
    };
  }

  async invalidateRole(tenantId: string, roleId: string): Promise<void> {
    await this.redis.del(this.cacheKey(tenantId, roleId));
  }
}
