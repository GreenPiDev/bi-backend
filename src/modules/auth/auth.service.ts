import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, type User } from '@prisma/client';
import * as argon2 from 'argon2';
import { AppException } from '../../core/errors/app.exception';
import { PrismaService } from '../../core/prisma/prisma.service';
import { TenantsService } from '../tenants/tenants.service';
import type { LoginDto } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';
import { TokenService } from './token.service';

export interface SafeUser {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  role: User['role'];
  isPlatformAdmin: boolean;
}

export interface AuthResult {
  user: SafeUser;
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenants: TenantsService,
    private readonly tokens: TokenService,
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
        return tx.user.create({
          data: {
            tenantId,
            email: dto.email,
            passwordHash,
            name: dto.name,
            role: 'OWNER',
          },
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

  async me(userId: string): Promise<SafeUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new AppException(
        'NOT_FOUND',
        'Kullanici bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    return this.toSafeUser(user);
  }

  issueTokens(user: User): AuthResult {
    const accessToken = this.tokens.signAccessToken({
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role,
      isPlatformAdmin: user.isPlatformAdmin,
    });
    const refreshToken = this.tokens.signRefreshToken({
      sub: user.id,
      tenantId: user.tenantId,
    });
    return { accessToken, refreshToken, user: this.toSafeUser(user) };
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
}
