import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MODULE_KEY } from '../decorators/requires-module.decorator';
import { MODULE_PAGE_KEY } from '../decorators/module-page.decorator';
import {
  PERMISSION_KEY,
  type RequiredPermission,
} from '../decorators/requires-permission.decorator';
import type { RequestUser } from '../decorators/current-user.decorator';
import { AppException } from '../errors/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { findModuleDefinition } from '../modules/module-registry';
import { PageModulesService } from '../modules/page-modules.service';

@Injectable()
export class ModuleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly pageModules: PageModulesService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const legacyModules = this.reflector.getAllAndOverride<
      string[] | undefined
    >(MODULE_KEY, [context.getHandler(), context.getClass()]);
    if (legacyModules && legacyModules.length > 0) {
      return this.checkModuleKeys(context, legacyModules);
    }

    const pageKey = this.resolvePageKey(context);
    if (!pageKey) {
      return true;
    }

    const moduleKeys = await this.pageModules.getModuleKeysForPage(pageKey);
    if (moduleKeys.length === 0) {
      return true;
    }
    return this.checkModuleKeys(context, moduleKeys);
  }

  /**
   * `@ModulePage(...)` acikca setlenmemisse, `@RequiresPermission(...)`'in pageKey'ini
   * kullanir - accounts/contacts gibi bircok ucta zaten bu metadata var, ayrica
   * tekrar etmeye gerek yok (bkz. accounts.controller.ts, imports.controller.ts).
   */
  private resolvePageKey(context: ExecutionContext): string | undefined {
    const explicit = this.reflector.getAllAndOverride<string | undefined>(
      MODULE_PAGE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (explicit) {
      return explicit;
    }
    const permission = this.reflector.getAllAndOverride<
      RequiredPermission | undefined
    >(PERMISSION_KEY, [context.getHandler(), context.getClass()]);
    return permission?.pageKey;
  }

  private async checkModuleKeys(
    context: ExecutionContext,
    moduleKeys: string[],
  ): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ user?: RequestUser }>();
    const tenantId = request.user?.tenantId;
    if (!tenantId) {
      throw new AppException(
        'FORBIDDEN',
        'Bu islem icin yetkin yok.',
        HttpStatus.FORBIDDEN,
      );
    }

    if (
      moduleKeys.some((moduleKey) => findModuleDefinition(moduleKey)?.alwaysOn)
    ) {
      return true;
    }

    const enabled = await this.prisma.tenantModule.findFirst({
      where: { tenantId, moduleKey: { in: moduleKeys }, disabledAt: null },
    });
    if (!enabled) {
      throw new AppException(
        'MODULE_NOT_ENABLED',
        'Bu ozellik icin modul aktif degil.',
        HttpStatus.FORBIDDEN,
      );
    }

    return true;
  }
}
