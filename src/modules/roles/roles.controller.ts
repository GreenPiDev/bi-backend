import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CompanyAdminGuard } from '../../core/guards/company-admin.guard';
import {
  CurrentUser,
  type RequestUser,
} from '../../core/decorators/current-user.decorator';
import { RequiresPermission } from '../../core/decorators/requires-permission.decorator';
import {
  PAGE_REGISTRY,
  type PageDefinition,
} from '../../core/modules/page-registry';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import { TenantsService } from '../tenants/tenants.service';
import { CreateRoleSchema, UpdateRoleSchema } from './dto/role.dto';
import type { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';
import { RolesService, type RoleView } from './roles.service';

/**
 * Okuma (GET) uclari "settings/roles", "settings/pageAccess" veya "settings/actionPermissions"
 * tab'larindan herhangi birine VIEW izni olan herkese acik - boylece Roller, Sayfa Erisimleri
 * ve Islem Izinleri sekmeleri normal RBAC ile gorunur/gizlenir tutarli sekilde. Yazma islemleri
 * (POST/PATCH/DELETE) ise kasitli olarak Permission sisteminin DISINDA, sabit
 * CompanyAdminGuard'da kalir - bir role sadece VIEW izni verilerek rol/izin
 * yonetimine yetki yukseltmesi yapamaz (bkz. company-admin.guard.ts, SS6).
 */
@Controller()
export class RolesController {
  constructor(
    private readonly roles: RolesService,
    private readonly tenants: TenantsService,
  ) {}

  /** Tenant'in platform-admin tarafindan kapatilmis oldugu bir module bagli sayfalari
   * (orn. crm/analytics kapaliysa Firmalar/Kisiler/Panolar/Veri Kumeleri) listeden
   * cikarir - aksi halde COMPANYADMIN, erisimi zaten kapali sayfalara rol/izin
   * atayabiliyormus gibi gorunurdu (bkz. TenantsService.listPageAccess). */
  @Get('page-registry')
  @RequiresPermission('settings', 'VIEW', [
    'roles',
    'pageAccess',
    'actionPermissions',
  ])
  async pageRegistry(
    @CurrentUser() user: RequestUser,
  ): Promise<readonly PageDefinition[]> {
    const access = await this.tenants.listPageAccess(user.tenantId);
    const accessibleKeys = new Set(
      access.filter((a) => a.accessible).map((a) => a.pageKey),
    );
    return PAGE_REGISTRY.filter(
      (page) => page.alwaysVisible || accessibleKeys.has(page.key),
    );
  }

  @Get('roles')
  @RequiresPermission('settings', 'VIEW', [
    'roles',
    'pageAccess',
    'actionPermissions',
  ])
  list(): Promise<RoleView[]> {
    return this.roles.list();
  }

  @Post('roles')
  @UseGuards(CompanyAdminGuard)
  create(
    @Body(new ZodValidationPipe(CreateRoleSchema)) dto: CreateRoleDto,
  ): Promise<RoleView> {
    return this.roles.create(dto);
  }

  @Patch('roles/:id')
  @UseGuards(CompanyAdminGuard)
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateRoleSchema)) dto: UpdateRoleDto,
  ): Promise<RoleView> {
    return this.roles.update(id, dto);
  }

  @Delete('roles/:id')
  @UseGuards(CompanyAdminGuard)
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.roles.remove(id);
  }
}
