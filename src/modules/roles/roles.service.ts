import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import {
  isKnownPageKey,
  isKnownTabKey,
} from '../../core/modules/page-registry';
import { PermissionsService } from '../../core/permissions/permissions.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { AuditService } from '../audit/audit.service';
import type { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';

export interface RoleView {
  id: string;
  name: string;
  isSystem: boolean;
  isBasic: boolean;
  isCompanyAdmin: boolean;
  userCount: number;
  permissions: { pageKey: string; tabKey: string | null; action: string }[];
}

function assertKnownPages(
  permissions: { pageKey: string; tabKey?: string | null }[],
): void {
  for (const p of permissions) {
    if (!isKnownPageKey(p.pageKey)) {
      throw new AppException(
        'UNKNOWN_PAGE',
        `Bilinmeyen sayfa: ${p.pageKey}`,
        HttpStatus.BAD_REQUEST,
      );
    }
    if (p.tabKey && !isKnownTabKey(p.pageKey, p.tabKey)) {
      throw new AppException(
        'UNKNOWN_PAGE',
        `"${p.pageKey}" sayfasinda bilinmeyen tab: ${p.tabKey}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}

@Injectable()
export class RolesService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly rawPrisma: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<RoleView[]> {
    const roles = await this.prisma.role.findMany({
      orderBy: { createdAt: 'asc' },
      include: { permissions: true, users: true },
    });
    return roles.map((role) => ({
      id: role.id,
      name: role.name,
      isSystem: role.isSystem,
      isBasic: role.isBasic,
      isCompanyAdmin: role.isCompanyAdmin,
      userCount: role.users.length,
      permissions: role.permissions.map((p) => ({
        pageKey: p.pageKey,
        tabKey: p.tabKey,
        action: p.action,
      })),
    }));
  }

  async create(dto: CreateRoleDto): Promise<RoleView> {
    assertKnownPages(dto.permissions);
    try {
      const role = await this.prisma.role.create({
        data: {
          name: dto.name,
          permissions: {
            create: dto.permissions.flatMap((p) =>
              p.actions.map((action) => ({
                pageKey: p.pageKey,
                tabKey: p.tabKey ?? null,
                action,
              })),
            ),
          },
        } as never,
        include: { permissions: true, users: true },
      });
      await this.audit.log({
        action: 'CREATE',
        entity: 'Role',
        entityId: role.id,
        meta: { name: role.name },
      });
      return {
        id: role.id,
        name: role.name,
        isSystem: role.isSystem,
        isBasic: role.isBasic,
        isCompanyAdmin: role.isCompanyAdmin,
        userCount: role.users.length,
        permissions: role.permissions,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new AppException(
          'ROLE_ALREADY_EXISTS',
          'Bu isimde bir rol zaten var.',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateRoleDto): Promise<RoleView> {
    const role = await this.prisma.role.findFirst({ where: { id } });
    if (!role) {
      throw new AppException(
        'NOT_FOUND',
        'Rol bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    if (role.isSystem) {
      throw new AppException(
        'SYSTEM_ROLE_READONLY',
        'Sistem rolleri (COMPANYADMIN, Temel Kullanici) duzenlenemez.',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (dto.permissions) {
      assertKnownPages(dto.permissions);
    }

    try {
      await this.rawPrisma.$transaction(async (tx) => {
        if (dto.name !== undefined) {
          await tx.role.update({ where: { id }, data: { name: dto.name } });
        }
        if (dto.permissions !== undefined) {
          await tx.rolePermission.deleteMany({ where: { roleId: id } });
          const rows = dto.permissions.flatMap((p) =>
            p.actions.map((action) => ({
              roleId: id,
              pageKey: p.pageKey,
              tabKey: p.tabKey ?? null,
              action,
            })),
          );
          if (rows.length > 0) {
            await tx.rolePermission.createMany({ data: rows });
          }
        }
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new AppException(
          'ROLE_ALREADY_EXISTS',
          'Bu isimde bir rol zaten var.',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }

    await this.permissions.invalidateRole(role.tenantId, id);
    await this.audit.log({
      action: 'UPDATE',
      entity: 'Role',
      entityId: id,
      meta: { name: dto.name },
    });

    const updated = await this.prisma.role.findFirst({
      where: { id },
      include: { permissions: true, users: true },
    });
    if (!updated) {
      throw new AppException(
        'NOT_FOUND',
        'Rol bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    return {
      id: updated.id,
      name: updated.name,
      isSystem: updated.isSystem,
      isBasic: updated.isBasic,
      isCompanyAdmin: updated.isCompanyAdmin,
      userCount: updated.users.length,
      permissions: updated.permissions,
    };
  }

  /** Rol silinince o role sahip kullanicilar, hala baska bir rolu yoksa, otomatik olarak
   * tenant'in silinemez BASIC ("Temel Kullanici") roluyle eslenir - ilk login'de hata veya
   * beyaz ekran almamalari icin (bkz. CLAUDE.md, docs/PLAN_ROL_YONETIMI.md SS0). */
  async remove(id: string): Promise<void> {
    const role = await this.prisma.role.findFirst({
      where: { id },
      include: { users: true },
    });
    if (!role) {
      throw new AppException(
        'NOT_FOUND',
        'Rol bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    if (role.isSystem) {
      throw new AppException(
        'SYSTEM_ROLE_READONLY',
        'Sistem rolleri (COMPANYADMIN, Temel Kullanici) silinemez.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const basicRole = await this.prisma.role.findFirst({
      where: { tenantId: role.tenantId, isBasic: true },
    });
    if (!basicRole) {
      throw new AppException(
        'BASIC_ROLE_MISSING',
        'Bu tenant icin temel rol bulunamadi, silme islemi guvenli degil.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const affectedUserIds = role.users.map((u) => u.userId);

    await this.rawPrisma.$transaction(async (tx) => {
      await tx.role.delete({ where: { id } });
      for (const userId of affectedUserIds) {
        const remaining = await tx.userRoleLink.count({ where: { userId } });
        if (remaining === 0) {
          await tx.userRoleLink.create({
            data: { userId, roleId: basicRole.id },
          });
        }
      }
    });

    await this.permissions.invalidateRole(role.tenantId, id);
    await this.audit.log({
      action: 'DELETE',
      entity: 'Role',
      entityId: id,
      meta: { name: role.name, reassignedUsers: affectedUserIds.length },
    });
  }
}
