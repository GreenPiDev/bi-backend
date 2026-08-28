import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AppException } from '../errors/app.exception';
import { TokenService } from '../../modules/auth/token.service';
import { ACCESS_TOKEN_COOKIE } from '../../modules/auth/token.types';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokenService: TokenService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
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
      request.user = {
        id: payload.sub,
        tenantId: payload.tenantId,
        roleIds: payload.roleIds,
        isPlatformAdmin: payload.isPlatformAdmin,
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
}
