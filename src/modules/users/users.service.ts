import { randomUUID } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { User, UserRole } from '@prisma/client';
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
  type AuthResult,
  type SafeUser,
} from '../auth/auth.service';
import type { AcceptInvitationDto } from './dto/accept-invitation.dto';
import type { ChangePasswordDto } from './dto/change-password.dto';
import type { InviteUserDto } from './dto/invite-user.dto';
import type { UpdateProfileDto } from './dto/update-profile.dto';

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
    });
    return users.map((u) => this.toSafeUser(u));
  }

  async getProfile(actingUser: RequestUser): Promise<UserProfile> {
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
    return this.toProfile(user);
  }

  async invite(
    inviterRole: UserRole,
    dto: InviteUserDto,
  ): Promise<{ token: string; expiresAt: Date }> {
    if (dto.role === 'ADMIN' && inviterRole !== 'OWNER') {
      throw new AppException(
        'FORBIDDEN',
        'ADMIN rolunde davet sadece OWNER tarafindan yapilabilir.',
        HttpStatus.FORBIDDEN,
      );
    }

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
        role: dto.role,
        token,
        expiresAt,
      },
    });

    await this.audit.log({
      action: 'INVITE',
      entity: 'Invitation',
      entityId: token,
      meta: { email: dto.email, role: dto.role },
    });

    return { token, expiresAt };
  }

  async updateRole(
    actingUser: RequestUser,
    targetUserId: string,
    newRole: UserRole,
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
    });
    if (!target) {
      throw new AppException(
        'NOT_FOUND',
        'Kullanici bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }

    if (
      (target.role === 'OWNER' || newRole === 'OWNER') &&
      actingUser.role !== 'OWNER'
    ) {
      throw new AppException(
        'FORBIDDEN',
        'OWNER roluyle ilgili degisiklikleri sadece OWNER yapabilir.',
        HttpStatus.FORBIDDEN,
      );
    }

    const updated = await this.prisma.user.update({
      where: { id: targetUserId },
      data: { role: newRole },
    });
    await this.audit.log({
      action: 'UPDATE_ROLE',
      entity: 'User',
      entityId: targetUserId,
      meta: { previousRole: target.role, newRole },
    });
    return this.toSafeUser(updated);
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
    });

    await this.audit.log({
      action: 'UPDATE_PROFILE',
      entity: 'User',
      entityId: actingUser.id,
      meta: { name: dto.name, email: dto.email },
    });

    return this.toProfile(updated);
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
    role: UserRole;
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
    return {
      tenantName: invitation.tenant.name,
      email: invitation.email,
      role: invitation.role,
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
          role: invitation.role,
        },
      });
      await tx.invitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      });
      return created;
    });

    return this.authService.issueTokens(user);
  }

  private toSafeUser(user: User): SafeUser {
    return {
      id: user.id,
      tenantId: user.tenantId,
      email: user.email,
      name: user.name,
      role: user.role,
      isPlatformAdmin: user.isPlatformAdmin,
    };
  }

  private toProfile(user: User): UserProfile {
    return {
      ...this.toSafeUser(user),
      isActive: user.isActive,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    };
  }
}
