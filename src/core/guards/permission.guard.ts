import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  PERMISSION_KEY,
  type RequiredPermission,
} from '../decorators/requires-permission.decorator';
import type { RequestUser } from '../decorators/current-user.decorator';
import { AppException } from '../errors/app.exception';
import { isKnownPageKey } from '../modules/page-registry';
import { PermissionsService } from '../permissions/permissions.service';
import { hasPermission } from '../permissions/permission.types';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<
      RequiredPermission | undefined
    >(PERMISSION_KEY, [context.getHandler(), context.getClass()]);
    if (!required) {
      return true;
    }

    if (!isKnownPageKey(required.pageKey)) {
      throw new AppException(
        'UNKNOWN_PAGE',
        'Bilinmeyen sayfa anahtari.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const request = context.switchToHttp().getRequest<{ user?: RequestUser }>();
    const user = request.user;
    if (!user) {
      throw new AppException(
        'UNAUTHORIZED',
        'Oturum bulunamadi.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const effective = await this.permissions.getEffectivePermissions(
      user.tenantId,
      user.roleIds,
    );

    const tabKeys = Array.isArray(required.tabKey)
      ? required.tabKey
      : [required.tabKey];
    const granted = tabKeys.some((tabKey) =>
      hasPermission(effective, required.pageKey, required.action, tabKey),
    );

    if (!granted) {
      throw new AppException(
        'FORBIDDEN',
        'Bu islem icin yetkin yok.',
        HttpStatus.FORBIDDEN,
      );
    }
    return true;
  }
}
