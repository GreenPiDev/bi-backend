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
import { TenantContext } from '../../core/tenant/tenant-context';
import { AuditService } from '../audit/audit.service';
import {
  toSafeUser,
  USER_WITH_ROLES_INCLUDE,
  type SafeUser,
  type UserWithRoles,
} from '../auth/auth.service';
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

@Injectable()
export class UsersService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly rawPrisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<SafeUser[]> {
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: 'asc' },
      include: USER_WITH_ROLES_INCLUDE,
    });
    return users.map((u) => toSafeUser(u as UserWithRoles));
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

    return { user: toSafeUser(user as UserWithRoles), temporaryPassword };
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
    return toSafeUser(updated as UserWithRoles);
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
      },
      include: USER_WITH_ROLES_INCLUDE,
    });

    await this.audit.log({
      action: 'UPDATE_PROFILE',
      entity: 'User',
      entityId: actingUser.id,
      meta: { name: dto.name, email: dto.email },
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

  private toProfile(user: UserWithRoles): UserProfile {
    return {
      ...toSafeUser(user),
      isActive: user.isActive,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    };
  }
}
