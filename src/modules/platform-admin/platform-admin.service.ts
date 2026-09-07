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
import { RealtimeService } from '../../core/realtime/realtime.service';
import { CrmReportProvisioningService } from '../datasets/crm-report-provisioning.service';
import {
  TenantsService,
  type TenantModuleStatus,
  type TenantSummary,
} from '../tenants/tenants.service';
import { CreateTenantDto } from './dto/create-tenant.dto';

export type { TenantSummary };

@Injectable()
export class PlatformAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenants: TenantsService,
    private readonly pageModules: PageModulesService,
    private readonly realtime: RealtimeService,
    private readonly crmReports: CrmReportProvisioningService,
  ) {}

  listTenants(): Promise<TenantSummary[]> {
    return this.tenants.listTenantSummaries();
  }

  async createTenant(
    dto: CreateTenantDto,
  ): Promise<{ tenant: TenantSummary; temporaryPassword: string }> {
    return this.tenants.createTenantWithAdmin(dto);
  }

  async resetAdminPassword(
    tenantId: string,
  ): Promise<{ temporaryPassword: string }> {
    await this.requireTenant(tenantId);
    return this.tenants.resetAdminPassword(tenantId);
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
    // Faz 11f (bkz. docs/VARSAYIMLAR.md V29): CRM rapor dataset'lerinin yasam dongusu
    // dogrudan crm modulunun ac/kapa durumuna baglidir, ayri bir modul kapisi yok.
    if (moduleKey === 'crm') {
      if (enabled) {
        await this.crmReports.provisionForTenant(tenantId);
      } else {
        await this.crmReports.deprovisionForTenant(tenantId);
      }
    }
    const modules = await this.tenants.listModules(tenantId);
    this.realtime.emitToTenant(tenantId, 'tenant.modules.updated', modules);
    return modules;
  }

  listModuleDefinitions(): readonly ModuleDefinition[] {
    return MODULE_REGISTRY;
  }

  listPageModules(): Promise<PageModuleAssignment[]> {
    return this.pageModules.listAssignments();
  }

  async setPageModule(
    pageKey: string,
    moduleKeys: string[],
  ): Promise<PageModuleAssignment[]> {
    const assignments = await this.pageModules.setAssignment(
      pageKey,
      moduleKeys,
    );
    this.realtime.emitToAll('page-modules.updated', assignments);
    return assignments;
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
