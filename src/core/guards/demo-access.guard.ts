import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { RequestUser } from '../decorators/current-user.decorator';
import {
  ALLOW_EXPIRED_DEMO_KEY,
  DEMO_RESTRICTED_KEY,
} from '../decorators/demo-access.decorator';
import { AppException } from '../errors/app.exception';

/**
 * Demo kullanicilari (User.isDemoUser) icin iki kural uygular, ikisi de DB'ye gitmeden
 * access token'daki alanlarla:
 * 1. Suresi dolmussa (demoExpiresAt < now) `@AllowExpiredDemo()` disindaki her uc
 *    DEMO_EXPIRED (403) doner - login olabilir ama sistemi kullanamaz.
 * 2. `@DemoRestricted()` uclari (kullanici/rol yonetimi) her zaman DEMO_RESTRICTED doner.
 * JwtAuthGuard'dan sonra calisir; @Public() uclarda request.user olmadigi icin no-op.
 */
@Injectable()
export class DemoAccessGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ user?: RequestUser }>();
    const user = request.user;
    if (!user?.isDemoUser) {
      return true;
    }
    const targets = [context.getHandler(), context.getClass()];

    const allowExpired = this.reflector.getAllAndOverride<boolean>(
      ALLOW_EXPIRED_DEMO_KEY,
      targets,
    );
    if (
      !allowExpired &&
      user.demoExpiresAt !== undefined &&
      user.demoExpiresAt <= Date.now()
    ) {
      throw new AppException(
        'DEMO_EXPIRED',
        'Deneme sureniz doldu.',
        HttpStatus.FORBIDDEN,
      );
    }

    const restricted = this.reflector.getAllAndOverride<boolean>(
      DEMO_RESTRICTED_KEY,
      targets,
    );
    if (restricted) {
      throw new AppException(
        'DEMO_RESTRICTED',
        'Bu islem deneme hesabinda kullanilamaz.',
        HttpStatus.FORBIDDEN,
      );
    }
    return true;
  }
}
