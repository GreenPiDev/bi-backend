import { randomUUID } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { Prisma } from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import {
  MODULE_REGISTRY,
  findModuleDefinition,
} from '../../core/modules/module-registry';
import { PageModulesService } from '../../core/modules/page-modules.service';
import {
  BASIC_ROLE_NAME,
  COMPANY_ADMIN_ROLE_NAME,
} from '../../core/permissions/system-role-names';
import { PrismaService } from '../../core/prisma/prisma.service';
import { generateTemporaryPassword } from '../../core/security/temporary-password';
import { slugify } from './slugify';

export interface CreateTenantWithAdminInput {
  tenantName: string;
  adminName: string;
  adminEmail: string;
}

export interface TenantSummary {
  id: string;
  name: string;
  slug: string;
  plan: string;
  createdAt: Date;
  adminEmail: string | null;
}

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

  /** Tenant listesi + her tenant'in COMPANYADMIN kullanicisinin e-postasi (platform-admin
   * ekraninda kiraci iletisim bilgisi olarak gosterilir). Birden fazla COMPANYADMIN varsa
   * en eski (ilk) kaydedilen alinir. */
  async listTenantSummaries(): Promise<TenantSummary[]> {
    const tenants = await this.prisma.tenant.findMany({
      select: { id: true, name: true, slug: true, plan: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    const admins = await this.prisma.user.findMany({
      where: {
        tenantId: { in: tenants.map((t) => t.id) },
        roles: { some: { role: { isCompanyAdmin: true } } },
      },
      select: { tenantId: true, email: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    const adminEmailByTenantId = new Map<string, string>();
    for (const admin of admins) {
      if (!adminEmailByTenantId.has(admin.tenantId)) {
        adminEmailByTenantId.set(admin.tenantId, admin.email);
      }
    }
    return tenants.map((tenant) => ({
      ...tenant,
      adminEmail: adminEmailByTenantId.get(tenant.id) ?? null,
    }));
  }

  /** Superadmin'in /new-customer formundan yeni bir kiraci + ilk COMPANYADMIN
   * kullanicisini olusturur. Kullaniciya gecici bir sifre atanir ve donus degerinde
   * gosterilir - kullanici bunu ilk girisinde degistirmelidir (bkz. UsersService.createUser
   * ile ayni desen). */
  async createTenantWithAdmin(
    dto: CreateTenantWithAdminInput,
  ): Promise<{ tenant: TenantSummary; temporaryPassword: string }> {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.adminEmail },
    });
    if (existingUser) {
      throw new AppException(
        'EMAIL_TAKEN',
        'Bu e-posta adresi zaten kullaniliyor.',
        HttpStatus.CONFLICT,
      );
    }

    const { id: tenantId, slug } = await this.createTenantWithUniqueSlug(
      dto.tenantName,
    );
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await argon2.hash(temporaryPassword, {
      type: argon2.argon2id,
    });

    try {
      const tenant = await this.prisma.$transaction(async (tx) => {
        const createdTenant = await tx.tenant.create({
          data: { id: tenantId, name: dto.tenantName, slug },
        });
        const companyAdminRole = await tx.role.create({
          data: {
            tenantId,
            name: COMPANY_ADMIN_ROLE_NAME,
            isSystem: true,
            isCompanyAdmin: true,
          },
        });
        await tx.role.create({
          data: {
            tenantId,
            name: BASIC_ROLE_NAME,
            isSystem: true,
            isBasic: true,
          },
        });
        await tx.user.create({
          data: {
            tenantId,
            email: dto.adminEmail,
            passwordHash,
            name: dto.adminName,
            roles: { create: { roleId: companyAdminRole.id } },
          },
        });
        return createdTenant;
      });
      return {
        tenant: { ...tenant, adminEmail: dto.adminEmail },
        temporaryPassword,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new AppException(
          'EMAIL_TAKEN',
          'Bu e-posta adresi zaten kullaniliyor.',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  /** Superadmin, musteri tenant'inin COMPANYADMIN kullanicisi sifresini unuttugunda
   * (bize ulastiginda) buradan sifirlar - UsersService.resetPassword'un tenant-ici
   * esdegeri, ama burada TenantContext yok (superadmin herhangi bir tenant'in icinde
   * degil), bu yuzden ayri bir metod: hedef kullaniciyi dogrudan tenantId'ye gore bulur. */
  async resetAdminPassword(
    tenantId: string,
  ): Promise<{ temporaryPassword: string }> {
    const admin = await this.prisma.user.findFirst({
      where: { tenantId, roles: { some: { role: { isCompanyAdmin: true } } } },
      orderBy: { createdAt: 'asc' },
    });
    if (!admin) {
      throw new AppException(
        'NOT_FOUND',
        'Bu kiraci icin yonetici kullanici bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await argon2.hash(temporaryPassword, {
      type: argon2.argon2id,
    });
    await this.prisma.user.update({
      where: { id: admin.id },
      data: { passwordHash },
    });

    return { temporaryPassword };
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
