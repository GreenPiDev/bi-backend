import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
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
import { REDIS_CLIENT } from '../../core/redis/redis-client.token';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { CrmReportProvisioningService } from '../datasets/crm-report-provisioning.service';
import { DrawingLibraryProvisioningService } from '../drawing-library/drawing-library-provisioning.service';
import { DrawingTemplatesProvisioningService } from '../drawing-templates/drawing-templates-provisioning.service';
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
    private readonly drawingLibrary: DrawingLibraryProvisioningService,
    private readonly drawingTemplates: DrawingTemplatesProvisioningService,
    private readonly crmReports: CrmReportProvisioningService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
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

  async updateTenantSlug(
    tenantId: string,
    slug: string,
  ): Promise<TenantSummary> {
    await this.requireTenant(tenantId);
    return this.tenants.updateSlug(tenantId, slug);
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
    // Faz D3 (bkz. docs/VARSAYIMLAR.md V52): built-in kutuphane komponentleri/pano
    // sablonlari sadece ACILISTA kopyalanir - CRM rapor dataset'lerinin aksine
    // (sentetik/yeniden-uretilebilir), bunlar tenant'in SERBESTCE duzenleyebildigi
    // gercek verilerdir; modul kapatilinca SILINMEZ ki tenant yeniden actiginda
    // kendi ozellestirmeleri kaybolmasin.
    if (moduleKey === 'drawings' && enabled) {
      await this.drawingLibrary.provisionForTenant(tenantId);
      await this.drawingTemplates.provisionForTenant(tenantId);
    }
    // Faz 11f (bkz. docs/VARSAYIMLAR.md V29): CRM rapor dataset'i sentetik/yeniden
    // uretilebilir oldugu icin (gercek kullanici verisi degil, drawings'teki
    // kutuphane/sablon satirlarinin aksine) crm kapatilinca da kaldirilir.
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

  /**
   * Tum cache servisleri (accounts, contacts, quotes, query vb.) `tenant:{id}:...`
   * anahtar namespace'ini paylasir (bkz. CLAUDE.md SS6, accounts-cache.service.ts).
   * Bu yuzden tek bir `tenant:*` pattern'i tum kiracilarin tum onbelleklerini kapsar.
   */
  async flushAllTenantCaches(): Promise<{ deletedKeyCount: number }> {
    let deletedKeyCount = 0;
    const stream = this.redis.scanStream({ match: 'tenant:*', count: 100 });
    for await (const keys of stream as AsyncIterable<string[]>) {
      if (keys.length > 0) {
        await this.redis.del(...keys);
        deletedKeyCount += keys.length;
      }
    }
    return { deletedKeyCount };
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
