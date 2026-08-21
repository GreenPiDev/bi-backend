import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MODULE_KEY } from '../decorators/requires-module.decorator';
import type { RequestUser } from '../decorators/current-user.decorator';
import { AppException } from '../errors/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { findModuleDefinition } from '../modules/module-registry';

@Injectable()
export class ModuleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredModules = this.reflector.getAllAndOverride<
      string[] | undefined
    >(MODULE_KEY, [context.getHandler(), context.getClass()]);
    if (!requiredModules || requiredModules.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: RequestUser }>();
    const tenantId = request.user?.tenantId;
    if (!tenantId) {
      throw new AppException(
        'FORBIDDEN',
        'Bu islem icin yetkin yok.',
        HttpStatus.FORBIDDEN,
      );
    }

    for (const moduleKey of requiredModules) {
      const definition = findModuleDefinition(moduleKey);
      if (definition?.alwaysOn) {
        continue;
      }

      const enabled = await this.prisma.tenantModule.findFirst({
        where: { tenantId, moduleKey, disabledAt: null },
      });
      if (!enabled) {
        throw new AppException(
          'MODULE_NOT_ENABLED',
          'Bu ozellik icin modul aktif degil.',
          HttpStatus.FORBIDDEN,
        );
      }
    }

    return true;
  }
}
