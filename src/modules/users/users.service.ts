import { randomUUID } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { type RequestUser } from '../../core/decorators/current-user.decorator';
import { AppException } from '../../core/errors/app.exception';
import { PrismaService } from '../../core/prisma/prisma.service';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { TenantContext } from '../../core/tenant/tenant-context';
import { AuditService } from '../audit/audit.service';
import {
  AuthService,
  toSafeUser,
  USER_WITH_ROLES_INCLUDE,
  type AuthResult,
  type SafeUser,
  type UserWithRoles,
} from '../auth/auth.service';
import type { AcceptInvitationDto } from './dto/accept-invitation.dto';
import type { ChangePasswordDto } from './dto/change-password.dto';
import type { InviteUserDto } from './dto/invite-user.dto';
import type { UpdateProfileDto } from './dto/update-profile.dto';
import type { UpdateRoleDto } from './dto/update-role.dto';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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
    private readonly authService: AuthService,
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

  async invite(
    dto: InviteUserDto,
  ): Promise<{ token: string; expiresAt: Date }> {
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

    const token = randomUUID();
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
    await this.prisma.invitation.create({
      data: {
        tenantId: TenantContext.getOrThrow().tenantId,
        email: dto.email,
        roleIds: dto.roleIds,
        token,
        expiresAt,
      },
    });

    await this.audit.log({
      action: 'INVITE',
      entity: 'Invitation',
      entityId: token,
      meta: { email: dto.email, roleIds: dto.roleIds },
    });

    return { token, expiresAt };
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

  async getInvitationInfo(token: string): Promise<{
    tenantName: string;
    email: string;
    roleIds: string[];
    roleNames: string[];
    expired: boolean;
  }> {
    const invitation = await this.rawPrisma.invitation.findUnique({
      where: { token },
      include: { tenant: true },
    });
    if (!invitation || invitation.acceptedAt) {
      throw new AppException(
        'INVITATION_NOT_FOUND',
        'Davet bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    const roles = await this.rawPrisma.role.findMany({
      where: { id: { in: invitation.roleIds } },
      select: { name: true },
    });
    return {
      tenantName: invitation.tenant.name,
      email: invitation.email,
      roleIds: invitation.roleIds,
      roleNames: roles.map((r) => r.name),
      expired: invitation.expiresAt < new Date(),
    };
  }

  async acceptInvitation(
    token: string,
    dto: AcceptInvitationDto,
  ): Promise<AuthResult> {
    const invitation = await this.rawPrisma.invitation.findUnique({
      where: { token },
    });
    if (!invitation) {
      throw new AppException(
        'INVITATION_NOT_FOUND',
        'Davet bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    if (invitation.acceptedAt) {
      throw new AppException(
        'INVITATION_ALREADY_ACCEPTED',
        'Bu davet zaten kabul edilmis.',
        HttpStatus.CONFLICT,
      );
    }
    if (invitation.expiresAt < new Date()) {
      throw new AppException(
        'INVITATION_EXPIRED',
        'Davetin suresi dolmus.',
        HttpStatus.GONE,
      );
    }

    const existingUser = await this.rawPrisma.user.findUnique({
      where: { email: invitation.email },
    });
    if (existingUser) {
      throw new AppException(
        'EMAIL_TAKEN',
        'Bu e-posta adresi zaten bir kullaniciya ait.',
        HttpStatus.CONFLICT,
      );
    }

    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
    });

    const user = await this.rawPrisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          tenantId: invitation.tenantId,
          email: invitation.email,
          passwordHash,
          name: dto.name,
          roles: {
            create: invitation.roleIds.map((roleId) => ({ roleId })),
          },
        },
        include: USER_WITH_ROLES_INCLUDE,
      });
      await tx.invitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      });
      return created;
    });

    return this.authService.issueTokens(user as UserWithRoles);
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
