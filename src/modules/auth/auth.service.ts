import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, type User } from '@prisma/client';
import * as argon2 from 'argon2';
import { AppException } from '../../core/errors/app.exception';
import { PrismaService } from '../../core/prisma/prisma.service';
import {
  BASIC_ROLE_NAME,
  COMPANY_ADMIN_ROLE_NAME,
} from '../../core/permissions/system-role-names';
import type { EffectivePermissionSet } from '../../core/permissions/permission.types';
import { PermissionsService } from '../../core/permissions/permissions.service';
import { TenantsService } from '../tenants/tenants.service';
import type { LoginDto } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';
import { TokenService } from './token.service';

export interface SafeUserRole {
  id: string;
  name: string;
}

export interface SafeUser {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  roles: SafeUserRole[];
  isPlatformAdmin: boolean;
}

/** /auth/me ve login/register/refresh yanitlarindaki "su an giris yapmis kullanici"
 * gorunumu - frontend nav filtreleme (G1) bu `permissions` alanini kullanir. Diger
 * kullanicilarin listelendigi yerlerde (UsersService.list vb.) sade SafeUser yeterlidir. */
export interface AuthenticatedUser extends SafeUser {
  permissions: EffectivePermissionSet;
}

export type UserWithRoles = User & {
  roles: { role: { id: string; name: string } }[];
};

export const USER_WITH_ROLES_INCLUDE = {
  roles: { include: { role: { select: { id: true, name: true } } } },
} as const;

export interface AuthResult {
  user: AuthenticatedUser;
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenants: TenantsService,
    private readonly tokens: TokenService,
    private readonly permissions: PermissionsService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResult> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new AppException(
        'EMAIL_TAKEN',
        'Bu e-posta adresi zaten kullaniliyor.',
        HttpStatus.CONFLICT,
      );
    }

    const { id: tenantId, slug } =
      await this.tenants.createTenantWithUniqueSlug(dto.tenantName);
    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
    });

    try {
      const user = await this.prisma.$transaction(async (tx) => {
        await tx.tenant.create({
          data: { id: tenantId, name: dto.tenantName, slug },
        });
        const companyAdminRole = await tx.role.create({
          data: {
            tenantId,
            name: COMPANY_ADMIN_ROLE_NAME,
            isSystem: true,
            isCompanyAdmin: true,
          },
        });
        await tx.role.create({
          data: {
            tenantId,
            name: BASIC_ROLE_NAME,
            isSystem: true,
            isBasic: true,
          },
        });
        return tx.user.create({
          data: {
            tenantId,
            email: dto.email,
            passwordHash,
            name: dto.name,
            roles: { create: { roleId: companyAdminRole.id } },
          },
          include: USER_WITH_ROLES_INCLUDE,
        });
      });
      return this.issueTokens(user);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new AppException(
          'EMAIL_TAKEN',
          'Bu e-posta adresi zaten kullaniliyor.',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: USER_WITH_ROLES_INCLUDE,
    });
    if (
      !user ||
      !user.isActive ||
      !(await argon2.verify(user.passwordHash, dto.password))
    ) {
      throw new AppException(
        'INVALID_CREDENTIALS',
        'E-posta veya sifre hatali.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    return this.issueTokens(user);
  }

  async refresh(refreshToken: string): Promise<AuthResult> {
    let payload: { sub: string; tenantId: string };
    try {
      payload = this.tokens.verifyRefreshToken(refreshToken);
    } catch {
      throw new AppException(
        'UNAUTHORIZED',
        'Refresh token gecersiz veya suresi dolmus.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: USER_WITH_ROLES_INCLUDE,
    });
    if (!user || !user.isActive || user.tenantId !== payload.tenantId) {
      throw new AppException(
        'UNAUTHORIZED',
        'Kullanici bulunamadi.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    return this.issueTokens(user);
  }

  async me(userId: string): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: USER_WITH_ROLES_INCLUDE,
    });
    if (!user) {
      throw new AppException(
        'NOT_FOUND',
        'Kullanici bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    return this.toAuthenticatedUser(user);
  }

  async issueTokens(user: UserWithRoles): Promise<AuthResult> {
    const roleIds = user.roles.map((r) => r.role.id);
    const accessToken = this.tokens.signAccessToken({
      sub: user.id,
      tenantId: user.tenantId,
      roleIds,
      isPlatformAdmin: user.isPlatformAdmin,
    });
    const refreshToken = this.tokens.signRefreshToken({
      sub: user.id,
      tenantId: user.tenantId,
    });
    return {
      accessToken,
      refreshToken,
      user: await this.toAuthenticatedUser(user),
    };
  }

  private async toAuthenticatedUser(
    user: UserWithRoles,
  ): Promise<AuthenticatedUser> {
    const roleIds = user.roles.map((r) => r.role.id);
    const permissions = await this.permissions.getEffectivePermissions(
      user.tenantId,
      roleIds,
    );
    return { ...toSafeUser(user), permissions };
  }
}

export function toSafeUser(user: UserWithRoles): SafeUser {
  return {
    id: user.id,
    tenantId: user.tenantId,
    email: user.email,
    name: user.name,
    roles: user.roles.map((r) => r.role),
    isPlatformAdmin: user.isPlatformAdmin,
  };
}
