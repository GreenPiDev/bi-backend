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
import type { ExtendDemoUserDto } from './dto/extend-demo-user.dto';

export type { TenantSummary };

const DEMO_USER_SELECT = {
  id: true,
  name: true,
  demoCompanyName: true,
  email: true,
  phone: true,
  isActive: true,
  createdAt: true,
  lastLoginAt: true,
  demoExpiresAt: true,
  tenant: { select: { slug: true } },
} as const;

function toDemoUserSummary({
  demoCompanyName,
  tenant,
  ...user
}: {
  id: string;
  name: string;
  demoCompanyName: string | null;
  email: string;
  phone: string | null;
  isActive: boolean;
  createdAt: Date;
  lastLoginAt: Date | null;
  demoExpiresAt: Date | null;
  tenant: { slug: string };
}): DemoUserSummary {
  return { ...user, companyName: demoCompanyName, tenantSlug: tenant.slug };
}

/** Super admin "Demo Kullanicilari" sayfasindaki satir (bkz. modules/demo-accounts). */
export interface DemoUserSummary {
  id: string;
  name: string;
  companyName: string | null;
  email: string;
  phone: string | null;
  tenantSlug: string;
  isActive: boolean;
  createdAt: Date;
  lastLoginAt: Date | null;
  /** Ilk login'de setlenir; null = hic giris yapmadi. */
  demoExpiresAt: Date | null;
}

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

  listTenants(q?: string): Promise<TenantSummary[]> {
    return this.tenants.listTenantSummaries(q);
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

  /** Tanitim sayfasindan acilan tum demo kullanicilari, en yeni once. Tenant'lar arasi
   * okuma - PrismaService ham (tenant-scoped extension'siz) oldugu icin filtre yok. */
  async listDemoUsers(): Promise<DemoUserSummary[]> {
    const users = await this.prisma.user.findMany({
      where: { isDemoUser: true },
      orderBy: { createdAt: 'desc' },
      select: DEMO_USER_SELECT,
    });
    return users.map(toDemoUserSummary);
  }

  /**
   * Re-activates a demo user: the trial now ends `now + days/hours/minutes`
   * (not counted from the old expiry), and the account is set active again.
   */
  /**
   * "Deactivates" a demo user by ending the trial right now: the account stays active
   * (can still log in) but sees the expired-trial modal, same as a natural expiry.
   * Setting `isActive=false` would block login entirely instead.
   */
  async deactivateDemoUser(id: string): Promise<DemoUserSummary> {
    const { tenantId } = await this.requireDemoUser(id);
    const updated = await this.prisma.user.update({
      where: { id },
      data: { demoExpiresAt: new Date() },
      select: DEMO_USER_SELECT,
    });
    this.notifyDemoUserChanged(tenantId, id);
    return toDemoUserSummary(updated);
  }

  /** Lets an open session of that demo user refetch /auth/me without a page refresh. */
  private notifyDemoUserChanged(tenantId: string, userId: string): void {
    this.realtime.emitToTenant(tenantId, 'demo-user.updated', { userId });
  }

  private async requireDemoUser(id: string): Promise<{ tenantId: string }> {
    const existing = await this.prisma.user.findFirst({
      where: { id, isDemoUser: true },
      select: { tenantId: true },
    });
    if (!existing) {
      throw new AppException(
        'DEMO_USER_NOT_FOUND',
        'Demo kullanıcısı bulunamadı.',
        HttpStatus.NOT_FOUND,
      );
    }
    return existing;
  }

  async extendDemoUser(
    id: string,
    duration: ExtendDemoUserDto,
  ): Promise<DemoUserSummary> {
    const { tenantId } = await this.requireDemoUser(id);
    const durationMs =
      ((duration.days * 24 + duration.hours) * 60 + duration.minutes) * 60_000;
    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        demoExpiresAt: new Date(Date.now() + durationMs),
        isActive: true,
      },
      select: DEMO_USER_SELECT,
    });
    this.notifyDemoUserChanged(tenantId, id);
    return toDemoUserSummary(updated);
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
