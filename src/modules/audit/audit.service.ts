import { Inject, Injectable } from '@nestjs/common';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { TenantContext } from '../../core/tenant/tenant-context';

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

  async list(): Promise<AuditLogView[]> {
    const logs = await this.prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: LIST_LIMIT,
    });
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
