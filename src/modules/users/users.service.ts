import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { type RequestUser } from '../../core/decorators/current-user.decorator';
import { AppException } from '../../core/errors/app.exception';
import { PrismaService } from '../../core/prisma/prisma.service';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { generateTemporaryPassword } from '../../core/security/temporary-password';
import { FileUrlService } from '../../core/storage/file-url.service';
import { R2StorageService } from '../../core/storage/r2-storage.service';
import { TenantContext } from '../../core/tenant/tenant-context';
import { AuditService } from '../audit/audit.service';
import {
  toSafeUser,
  USER_WITH_ROLES_INCLUDE,
  type SafeUser,
  type UserWithRoles,
} from '../auth/auth.service';
import { detectAvatarImageExtension } from './avatar-image-validation';
import type { ChangePasswordDto } from './dto/change-password.dto';
import type { CreateUserDto } from './dto/create-user.dto';
import type { UpdateProfileDto } from './dto/update-profile.dto';
import type { UpdateRoleDto } from './dto/update-role.dto';

export { generateTemporaryPassword } from '../../core/security/temporary-password';

export interface UserProfile extends SafeUser {
  isActive: boolean;
  createdAt: Date;
  lastLoginAt: Date | null;
}

/** /settings/kullanicilar/:id profil sayfasi icin - kullanicinin sistemde olusturdugu
 * CRM kayitlarinin sayilari (Account/Contact sahiplik `ownerId` uzerinden, digerleri
 * `createdById` uzerinden - bkz. schema.prisma). Salt-okunur, sadece KPI kartlari icin. */
export interface UserStats {
  user: SafeUser;
  counts: {
    accounts: number;
    contacts: number;
    interactions: number;
    opportunities: number;
    quotes: number;
    projects: number;
    /** Satin alma siparisi (PurchaseOrder) - satis siparisinden (salesOrders) ayri bir
     * model, /siparisler sayfasindaki "Satın Alma Siparişleri" sekmesine karsilik gelir. */
    purchaseOrders: number;
    /** Satis siparisi (SalesOrder) - /siparisler sayfasindaki "Satış Siparişleri" sekmesi. */
    salesOrders: number;
  };
  /** Bu kullanicinin "bizden ilgili" olarak atandigi projeler (ProjectResponsible
   * uzerinden - createdById'den bagimsiz, counts.projects'ten farkli bir kume). */
  responsibleProjects: { id: string; projectNumber: string; name: string }[];
}

/** /settings/kullanicilar/:id sayfasinda bir KPI kartina tiklaninca acilan tablonun
 * hangi entity'yi istedigini belirtir - bkz. UsersService.getUserStatsEntityRows. */
export const USER_STATS_ENTITY_KINDS = [
  'accounts',
  'contacts',
  'interactions',
  'opportunities',
  'quotes',
  'projects',
  'purchaseOrders',
  'salesOrders',
] as const;
export type UserStatsEntityKind = (typeof USER_STATS_ENTITY_KINDS)[number];

@Injectable()
export class UsersService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly rawPrisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: R2StorageService,
    private readonly fileUrl: FileUrlService,
  ) {}

  async list(includeInactive = false): Promise<SafeUser[]> {
    const users = await this.prisma.user.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { createdAt: 'asc' },
      include: USER_WITH_ROLES_INCLUDE,
    });
    return users.map((u) => toSafeUser(u as UserWithRoles, this.fileUrl));
  }

  async getProfile(actingUser: RequestUser): Promise<UserProfile> {
    const user = await this.prisma.user.findFirst({
      where: { id: actingUser.id },
      include: USER_WITH_ROLES_INCLUDE,
    });
    if (!user) {
      throw new AppException(
        'NOT_FOUND',
        'Kullanici bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    return this.toProfile(user as UserWithRoles);
  }

  /** roleIds'in tenant'a ait gercek roller oldugunu dogrular - baska bir tenant'in
   * roleId'si gonderilirse (404 yerine burada) sessizce filtrelenmez, hata firlatilir. */
  private async assertRoleIdsBelongToTenant(roleIds: string[]): Promise<void> {
    const count = await this.prisma.role.count({
      where: { id: { in: roleIds } },
    });
    if (count !== roleIds.length) {
      throw new AppException(
        'UNKNOWN_ROLE',
        'Belirtilen rollerden biri veya birden fazlasi bu tenant icinde bulunamadi.',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async createUser(
    dto: CreateUserDto,
  ): Promise<{ user: SafeUser; temporaryPassword: string }> {
    await this.assertRoleIdsBelongToTenant(dto.roleIds);

    const existingUser = await this.rawPrisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existingUser) {
      throw new AppException(
        'EMAIL_TAKEN',
        'Bu e-posta adresi zaten bir kullaniciya ait.',
        HttpStatus.CONFLICT,
      );
    }

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await argon2.hash(temporaryPassword, {
      type: argon2.argon2id,
    });

    const user = await this.prisma.user.create({
      data: {
        tenantId: TenantContext.getOrThrow().tenantId,
        email: dto.email,
        name: dto.name,
        passwordHash,
        roles: {
          create: dto.roleIds.map((roleId) => ({ roleId })),
        },
      },
      include: USER_WITH_ROLES_INCLUDE,
    });

    await this.audit.log({
      action: 'CREATE_USER',
      entity: 'User',
      entityId: user.id,
      meta: { email: dto.email, roleIds: dto.roleIds },
    });

    return {
      user: toSafeUser(user as UserWithRoles, this.fileUrl),
      temporaryPassword,
    };
  }

  async resetPassword(
    actingUser: RequestUser,
    targetUserId: string,
  ): Promise<{ temporaryPassword: string }> {
    if (targetUserId === actingUser.id) {
      throw new AppException(
        'CANNOT_RESET_OWN_PASSWORD',
        'Kendi sifreni bu ekrandan sifirlayamazsin, "Sifremi Degistir" ekranini kullan.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const target = await this.prisma.user.findFirst({
      where: { id: targetUserId },
    });
    if (!target) {
      throw new AppException(
        'NOT_FOUND',
        'Kullanici bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await argon2.hash(temporaryPassword, {
      type: argon2.argon2id,
    });
    await this.prisma.user.update({
      where: { id: targetUserId },
      data: { passwordHash },
    });

    await this.audit.log({
      action: 'RESET_PASSWORD',
      entity: 'User',
      entityId: targetUserId,
    });

    return { temporaryPassword };
  }

  async updateRole(
    actingUser: RequestUser,
    targetUserId: string,
    dto: UpdateRoleDto,
  ): Promise<SafeUser> {
    if (targetUserId === actingUser.id) {
      throw new AppException(
        'CANNOT_CHANGE_OWN_ROLE',
        'Kendi rolunu degistiremezsin.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const target = await this.prisma.user.findFirst({
      where: { id: targetUserId },
      include: USER_WITH_ROLES_INCLUDE,
    });
    if (!target) {
      throw new AppException(
        'NOT_FOUND',
        'Kullanici bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }

    await this.assertRoleIdsBelongToTenant(dto.roleIds);

    const previousRoleIds = target.roles.map((r) => r.role.id);
    await this.rawPrisma.$transaction([
      this.rawPrisma.userRoleLink.deleteMany({
        where: { userId: targetUserId },
      }),
      this.rawPrisma.userRoleLink.createMany({
        data: dto.roleIds.map((roleId) => ({ userId: targetUserId, roleId })),
      }),
    ]);

    const updated = await this.prisma.user.findFirst({
      where: { id: targetUserId },
      include: USER_WITH_ROLES_INCLUDE,
    });
    await this.audit.log({
      action: 'UPDATE_ROLE',
      entity: 'User',
      entityId: targetUserId,
      meta: { previousRoleIds, newRoleIds: dto.roleIds },
    });
    return toSafeUser(updated as UserWithRoles, this.fileUrl);
  }

  async setActive(
    actingUser: RequestUser,
    targetUserId: string,
    isActive: boolean,
  ): Promise<SafeUser> {
    if (targetUserId === actingUser.id) {
      throw new AppException(
        'CANNOT_CHANGE_OWN_STATUS',
        'Kendi hesabini pasiflestiremezsin.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const target = await this.prisma.user.findFirst({
      where: { id: targetUserId },
    });
    if (!target) {
      throw new AppException(
        'NOT_FOUND',
        'Kullanici bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }

    const updated = await this.prisma.user.update({
      where: { id: targetUserId },
      data: { isActive },
      include: USER_WITH_ROLES_INCLUDE,
    });

    await this.audit.log({
      action: isActive ? 'ACTIVATE_USER' : 'DEACTIVATE_USER',
      entity: 'User',
      entityId: targetUserId,
    });

    return toSafeUser(updated as UserWithRoles, this.fileUrl);
  }

  async updateProfile(
    actingUser: RequestUser,
    dto: UpdateProfileDto,
  ): Promise<UserProfile> {
    if (dto.email) {
      const existing = await this.rawPrisma.user.findUnique({
        where: { email: dto.email },
      });
      if (existing && existing.id !== actingUser.id) {
        throw new AppException(
          'EMAIL_TAKEN',
          'Bu e-posta adresi zaten bir kullaniciya ait.',
          HttpStatus.CONFLICT,
        );
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: actingUser.id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.email !== undefined ? { email: dto.email } : {}),
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.defaultPageSize !== undefined
          ? { defaultPageSize: dto.defaultPageSize }
          : {}),
        ...(dto.columnPreferences !== undefined
          ? { columnPreferences: dto.columnPreferences }
          : {}),
      },
      include: USER_WITH_ROLES_INCLUDE,
    });

    await this.audit.log({
      action: 'UPDATE_PROFILE',
      entity: 'User',
      entityId: actingUser.id,
      meta: {
        name: dto.name,
        email: dto.email,
        defaultPageSize: dto.defaultPageSize,
      },
    });

    return this.toProfile(updated as UserWithRoles);
  }

  async changePassword(
    actingUser: RequestUser,
    dto: ChangePasswordDto,
  ): Promise<{ ok: true }> {
    const user = await this.prisma.user.findFirst({
      where: { id: actingUser.id },
    });
    if (!user) {
      throw new AppException(
        'NOT_FOUND',
        'Kullanici bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }

    const isValid = await argon2.verify(user.passwordHash, dto.currentPassword);
    if (!isValid) {
      throw new AppException(
        'INVALID_CREDENTIALS',
        'Mevcut sifre hatali.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const passwordHash = await argon2.hash(dto.newPassword, {
      type: argon2.argon2id,
    });
    await this.prisma.user.update({
      where: { id: actingUser.id },
      data: { passwordHash },
    });

    await this.audit.log({
      action: 'CHANGE_PASSWORD',
      entity: 'User',
      entityId: actingUser.id,
    });

    return { ok: true };
  }

  async uploadAvatar(
    actingUser: RequestUser,
    file: { mimetype: string; buffer: Buffer },
  ): Promise<UserProfile> {
    const user = await this.prisma.user.findFirst({
      where: { id: actingUser.id },
    });
    if (!user) {
      throw new AppException(
        'NOT_FOUND',
        'Kullanici bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }

    const ext = detectAvatarImageExtension(file.mimetype, file.buffer);
    const env =
      process.env.NODE_ENV === 'production' ? 'production' : 'development';
    // Kullanici basina tek gorsel oldugu icin anahtar sabit (id.ext) - urun gorseli
    // deseniyle ayni (bkz. ProductsService.uploadImage).
    const key = `PILENS/${env}/${user.tenantId}/avatars/${user.id}.${ext}`;

    await this.storage.upload(key, file.buffer, file.mimetype);
    if (user.avatarKey && user.avatarKey !== key) {
      await this.storage.delete(user.avatarKey);
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { avatarKey: key },
      include: USER_WITH_ROLES_INCLUDE,
    });
    await this.audit.log({
      action: 'UPDATE_PROFILE',
      entity: 'User',
      entityId: user.id,
      meta: { avatarUploaded: true },
    });
    return this.toProfile(updated as UserWithRoles);
  }

  async removeAvatar(actingUser: RequestUser): Promise<UserProfile> {
    const user = await this.prisma.user.findFirst({
      where: { id: actingUser.id },
    });
    if (!user) {
      throw new AppException(
        'NOT_FOUND',
        'Kullanici bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    if (user.avatarKey) {
      await this.storage.delete(user.avatarKey);
    }
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { avatarKey: null },
      include: USER_WITH_ROLES_INCLUDE,
    });
    await this.audit.log({
      action: 'UPDATE_PROFILE',
      entity: 'User',
      entityId: user.id,
      meta: { avatarRemoved: true },
    });
    return this.toProfile(updated as UserWithRoles);
  }

  async getUserStats(targetUserId: string): Promise<UserStats> {
    const user = await this.prisma.user.findFirst({
      where: { id: targetUserId },
      include: USER_WITH_ROLES_INCLUDE,
    });
    if (!user) {
      throw new AppException(
        'NOT_FOUND',
        'Kullanici bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }

    const [
      accounts,
      contacts,
      interactions,
      opportunities,
      quotes,
      projects,
      purchaseOrders,
      salesOrders,
    ] = await Promise.all([
      this.prisma.account.count({ where: { createdById: targetUserId } }),
      this.prisma.contact.count({ where: { createdById: targetUserId } }),
      this.prisma.interaction.count({ where: { createdById: targetUserId } }),
      this.prisma.opportunity.count({ where: { createdById: targetUserId } }),
      this.prisma.quote.count({ where: { createdById: targetUserId } }),
      this.prisma.project.count({ where: { createdById: targetUserId } }),
      this.prisma.purchaseOrder.count({ where: { createdById: targetUserId } }),
      this.prisma.salesOrder.count({ where: { createdById: targetUserId } }),
    ]);

    const responsibleRows = await this.prisma.projectResponsible.findMany({
      where: { userId: targetUserId },
      include: { project: true },
    });
    const responsibleProjects = responsibleRows
      .filter((row) => row.project !== null)
      .map((row) => ({
        id: row.project.id,
        projectNumber: row.project.projectNumber,
        name: row.project.name,
      }));

    return {
      user: toSafeUser(user as UserWithRoles, this.fileUrl),
      counts: {
        accounts,
        contacts,
        interactions,
        opportunities,
        quotes,
        projects,
        purchaseOrders,
        salesOrders,
      },
      responsibleProjects,
    };
  }

  /** Bir KPI kartina tiklaninca ilgili entity'nin "bu kullanicinin olusturdugu" satirlarini
   * dondurur - /firmalar, /kisiler vb. liste sayfalarindaki kolonlarla aynı alanlari tasir
   * ki frontend ayni render mantigini yeniden kullanabilsin. */
  async getUserStatsEntityRows(
    targetUserId: string,
    entity: UserStatsEntityKind,
  ) {
    switch (entity) {
      case 'accounts':
        return this.prisma.account.findMany({
          where: { createdById: targetUserId },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            name: true,
            sector: true,
            phone: true,
            email: true,
            createdAt: true,
          },
        });
      case 'contacts':
        return this.prisma.contact.findMany({
          where: { createdById: targetUserId },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            email: true,
            createdAt: true,
            account: { select: { name: true } },
          },
        });
      case 'interactions':
        return this.prisma.interaction.findMany({
          where: { createdById: targetUserId },
          orderBy: { occurredAt: 'desc' },
          select: {
            id: true,
            occurredAt: true,
            type: true,
            status: true,
            account: { select: { name: true } },
            contact: { select: { firstName: true, lastName: true } },
          },
        });
      case 'opportunities':
        return this.prisma.opportunity.findMany({
          where: { createdById: targetUserId },
          orderBy: { occurredAt: 'desc' },
          select: {
            id: true,
            name: true,
            stage: true,
            estimatedValue: true,
            estimatedValueCurrency: true,
            occurredAt: true,
          },
        });
      case 'quotes':
        return this.prisma.quote.findMany({
          where: { createdById: targetUserId },
          orderBy: { quoteDate: 'desc' },
          select: {
            id: true,
            quoteNumber: true,
            quoteDate: true,
            status: true,
            account: { select: { name: true } },
          },
        });
      case 'projects':
        return this.prisma.project.findMany({
          where: { createdById: targetUserId },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            projectNumber: true,
            name: true,
            estimatedBudget: true,
            account: { select: { name: true } },
          },
        });
      case 'purchaseOrders':
        return this.prisma.purchaseOrder.findMany({
          where: { createdById: targetUserId },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            orderNumber: true,
            status: true,
            createdAt: true,
            quote: { select: { quoteNumber: true } },
          },
        });
      case 'salesOrders':
        return this.prisma.salesOrder.findMany({
          where: { createdById: targetUserId },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            orderNumber: true,
            status: true,
            createdAt: true,
            account: { select: { name: true } },
            quote: { select: { quoteNumber: true } },
          },
        });
    }
  }

  private toProfile(user: UserWithRoles): UserProfile {
    return {
      ...toSafeUser(user, this.fileUrl),
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    };
  }
}
