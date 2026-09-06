import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../core/errors/app.exception';
import {
  MODULE_REGISTRY,
  type ModuleDefinition,
} from '../../core/modules/module-registry';
import {
  PageModulesService,
  type PageModuleAssignment,
} from '../../core/modules/page-modules.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import {
  TenantsService,
  type TenantModuleStatus,
} from '../tenants/tenants.service';

export interface TenantSummary {
  id: string;
  name: string;
  slug: string;
  plan: string;
  createdAt: Date;
}

@Injectable()
export class PlatformAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenants: TenantsService,
    private readonly pageModules: PageModulesService,
  ) {}

  listTenants(): Promise<TenantSummary[]> {
    return this.prisma.tenant.findMany({
      select: { id: true, name: true, slug: true, plan: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listTenantModules(tenantId: string): Promise<TenantModuleStatus[]> {
    await this.requireTenant(tenantId);
    return this.tenants.listModules(tenantId);
  }

  async setTenantModule(
    tenantId: string,
    moduleKey: string,
    enabled: boolean,
  ): Promise<TenantModuleStatus[]> {
    await this.requireTenant(tenantId);
    if (enabled) {
      await this.tenants.enableModule(tenantId, moduleKey);
    } else {
      await this.tenants.disableModule(tenantId, moduleKey);
    }
    return this.tenants.listModules(tenantId);
  }

  listModuleDefinitions(): readonly ModuleDefinition[] {
    return MODULE_REGISTRY;
  }

  listPageModules(): Promise<PageModuleAssignment[]> {
    return this.pageModules.listAssignments();
  }

  setPageModule(
    pageKey: string,
    moduleKeys: string[],
  ): Promise<PageModuleAssignment[]> {
    return this.pageModules.setAssignment(pageKey, moduleKeys);
  }

  private async requireTenant(tenantId: string): Promise<void> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true },
    });
    if (!tenant) {
      throw new AppException(
        'NOT_FOUND',
        'Kiraci bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
  }
}
