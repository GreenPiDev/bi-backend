import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type Redis from 'ioredis';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AppException } from '../errors/app.exception';
import { REDIS_CLIENT } from '../redis/redis-client.token';
import {
  isIssuedBeforePasswordChange,
  passwordChangedMarkerKey,
} from '../../modules/auth/password-reset.constants';
import { TokenService } from '../../modules/auth/token.service';
import { ACCESS_TOKEN_COOKIE } from '../../modules/auth/token.types';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokenService: TokenService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: unknown }>();
    const token = (request.cookies as Record<string, string> | undefined)?.[
      ACCESS_TOKEN_COOKIE
    ];
    if (!token) {
      throw new AppException(
        'UNAUTHORIZED',
        'Oturum bulunamadi.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    try {
      const payload = this.tokenService.verifyAccessToken(token);
      if (await this.wasIssuedBeforePasswordChange(payload)) {
        throw new Error('password changed');
      }
      request.user = {
        id: payload.sub,
        tenantId: payload.tenantId,
        roleIds: payload.roleIds,
        isPlatformAdmin: payload.isPlatformAdmin,
        isDemoUser: payload.isDemoUser,
        demoExpiresAt: payload.demoExpiresAt,
      };
      return true;
    } catch {
      throw new AppException(
        'UNAUTHORIZED',
        'Oturum gecersiz veya suresi dolmus.',
        HttpStatus.UNAUTHORIZED,
      );
    }
  }

  /** Sifre sifirlaninca Redis'e yazilan isaretle, eski access token'lar
   * (en fazla 15 dk yasarlar) beklemeden dusurulur. Redis hatasinda acik birakilir;
   * refresh yolundaki DB kontrolu yine korur. */
  private async wasIssuedBeforePasswordChange(payload: {
    sub: string;
    iat?: number;
  }): Promise<boolean> {
    try {
      const marker = await this.redis.get(
        passwordChangedMarkerKey(payload.sub),
      );
      if (!marker) return false;
      return isIssuedBeforePasswordChange(payload.iat, Number(marker));
    } catch {
      return false;
    }
  }
}
