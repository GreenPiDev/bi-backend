import { Inject, Injectable } from '@nestjs/common';
import type { PagedResult } from '../../core/dto/list-query.dto';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { TenantContext } from '../../core/tenant/tenant-context';
import type { AuditLogQueryDto } from './dto/audit-log.dto';

export interface AuditLogEntry {
  action: string;
  entity: string;
  entityId: string;
  meta?: Record<string, unknown>;
}

export interface AuditLogView {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  action: string;
  entity: string;
  entityId: string;
  meta: unknown;
  createdAt: Date;
}

const LIST_LIMIT = 200;

@Injectable()
export class AuditService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
  ) {}

  /** Cagiran servisin islemini engellememesi icin hatalar yutuluyor - denetim kaydi
   * basarisiz olsa bile asil is akisi (pano olusturma, dosya yukleme vb.) devam etmeli. */
  async log(entry: AuditLogEntry): Promise<void> {
    const store = TenantContext.get();
    if (!store) return;
    try {
      await this.prisma.auditLog.create({
        data: {
          tenantId: store.tenantId,
          userId: store.userId,
          action: entry.action,
          entity: entry.entity,
          entityId: entry.entityId,
          meta: entry.meta,
        },
      });
    } catch {
      // denetim kaydi basarisizligi asil islemi durdurmamali
    }
  }

  /**
   * `meta` filtresi, JSON `meta` alanindaki bir anahtarin degerine gore filtreler
   * (ornegin stok gecmisinde `{ productId }` - bkz. StockItemsService.listHistory).
   * `userId` ise duz bir kolon oldugu icin ayrica gecirilir.
   */
  async list(
    entity?: string,
    filters?: { userId?: string; meta?: Record<string, string> },
  ): Promise<AuditLogView[]> {
    const metaFilters = Object.entries(filters?.meta ?? {}).map(
      ([key, value]) => ({
        meta: { path: [key], equals: value },
      }),
    );
    const logs = await this.prisma.auditLog.findMany({
      where: {
        ...(entity ? { entity } : {}),
        ...(filters?.userId ? { userId: filters.userId } : {}),
        ...(metaFilters.length > 0 ? { AND: metaFilters } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: LIST_LIMIT,
    });
    return this.hydrateUsers(logs);
  }

  /** `/settings?tab=audit` icin 25'li sayfalama - LIST_LIMIT'e tabi diger dahili
   * cagiranlardan (stok/urun gecmisi) ayri tutuldu, onlar tum listeyi tek seferde ister. */
  async listPaged(query: AuditLogQueryDto): Promise<PagedResult<AuditLogView>> {
    const { page, pageSize, userId, entity, action, from, to } = query;
    const where = {
      ...(userId ? { userId } : {}),
      ...(entity ? { entity } : {}),
      ...(action ? { action } : {}),
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    };

    const [total, logs] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      data: await this.hydrateUsers(logs),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }

  private async hydrateUsers(
    logs: {
      id: string;
      userId: string;
      action: string;
      entity: string;
      entityId: string;
      meta: unknown;
      createdAt: Date;
    }[],
  ): Promise<AuditLogView[]> {
    const userIds = [...new Set(logs.map((l) => l.userId))];
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
    });
    const usersById = new Map(users.map((u) => [u.id, u]));

    return logs.map((log) => {
      const user = usersById.get(log.userId);
      return {
        id: log.id,
        userId: log.userId,
        userName: user?.name ?? '—',
        userEmail: user?.email ?? '—',
        action: log.action,
        entity: log.entity,
        entityId: log.entityId,
        meta: log.meta,
        createdAt: log.createdAt,
      };
    });
  }
}
