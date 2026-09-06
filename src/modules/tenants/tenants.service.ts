import { randomUUID } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../core/errors/app.exception';
import {
  MODULE_REGISTRY,
  findModuleDefinition,
} from '../../core/modules/module-registry';
import { PageModulesService } from '../../core/modules/page-modules.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { slugify } from './slugify';

export interface PageAccessStatus {
  pageKey: string;
  moduleKeys: string[];
  accessible: boolean;
}

export interface TenantModuleStatus {
  key: string;
  label: string;
  alwaysOn: boolean;
  enabled: boolean;
}

@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pageModules: PageModulesService,
  ) {}

  async createTenantWithUniqueSlug(
    name: string,
  ): Promise<{ id: string; slug: string }> {
    const base = slugify(name) || 'sirket';
    let slug = base;
    let attempt = 0;

    while (await this.prisma.tenant.findUnique({ where: { slug } })) {
      attempt += 1;
      slug = `${base}-${attempt > 3 ? randomUUID().slice(0, 6) : attempt + 1}`;
    }

    return { id: randomUUID(), slug };
  }

  async listModules(tenantId: string): Promise<TenantModuleStatus[]> {
    const rows = await this.prisma.tenantModule.findMany({
      where: { tenantId, disabledAt: null },
    });
    const enabledKeys = new Set(rows.map((row) => row.moduleKey));
    return MODULE_REGISTRY.map((module) => ({
      key: module.key,
      label: module.label,
      alwaysOn: module.alwaysOn,
      enabled: module.alwaysOn || enabledKeys.has(module.key),
    }));
  }

  async listPageAccess(tenantId: string): Promise<PageAccessStatus[]> {
    const [assignments, modules] = await Promise.all([
      this.pageModules.listAssignments(),
      this.listModules(tenantId),
    ]);
    const enabledByKey = new Map(modules.map((m) => [m.key, m.enabled]));
    return assignments.map((assignment) => ({
      pageKey: assignment.pageKey,
      moduleKeys: assignment.moduleKeys,
      accessible:
        assignment.moduleKeys.length === 0 ||
        assignment.moduleKeys.some(
          (moduleKey) => enabledByKey.get(moduleKey) ?? false,
        ),
    }));
  }

  async enableModule(tenantId: string, moduleKey: string): Promise<void> {
    const definition = this.requireToggleableModule(moduleKey);
    await this.prisma.tenantModule.upsert({
      where: { tenantId_moduleKey: { tenantId, moduleKey: definition.key } },
      create: { tenantId, moduleKey: definition.key },
      update: { enabledAt: new Date(), disabledAt: null },
    });
  }

  async disableModule(tenantId: string, moduleKey: string): Promise<void> {
    const definition = this.requireToggleableModule(moduleKey);
    await this.prisma.tenantModule.upsert({
      where: { tenantId_moduleKey: { tenantId, moduleKey: definition.key } },
      create: { tenantId, moduleKey: definition.key, disabledAt: new Date() },
      update: { disabledAt: new Date() },
    });
  }

  private requireToggleableModule(moduleKey: string) {
    const definition = findModuleDefinition(moduleKey);
    if (!definition) {
      throw new AppException(
        'UNKNOWN_MODULE',
        'Bilinmeyen modul.',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (definition.alwaysOn) {
      throw new AppException(
        'MODULE_ALWAYS_ON',
        'Bu modul her zaman aciktir, kapatilamaz.',
        HttpStatus.BAD_REQUEST,
      );
    }
    return definition;
  }
}
