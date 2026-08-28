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
import { RequiresPermission } from '../../core/decorators/requires-permission.decorator';
import {
  PAGE_REGISTRY,
  type PageDefinition,
} from '../../core/modules/page-registry';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import { CreateRoleSchema, UpdateRoleSchema } from './dto/role.dto';
import type { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';
import { RolesService, type RoleView } from './roles.service';

/**
 * Okuma (GET) uclari "settings/roles" veya "settings/pageAccess" tab'larindan
 * herhangi birine VIEW izni olan herkese acik - boylece Roller ve Sayfa Erisimleri
 * sekmeleri normal RBAC ile gorunur/gizlenir tutarli sekilde. Yazma islemleri
 * (POST/PATCH/DELETE) ise kasitli olarak Permission sisteminin DISINDA, sabit
 * CompanyAdminGuard'da kalir - bir role sadece VIEW izni verilerek rol/izin
 * yonetimine yetki yukseltmesi yapamaz (bkz. company-admin.guard.ts, SS6).
 */
@Controller()
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get('page-registry')
  @RequiresPermission('settings', 'VIEW', ['roles', 'pageAccess'])
  pageRegistry(): readonly PageDefinition[] {
    return PAGE_REGISTRY;
  }

  @Get('roles')
  @RequiresPermission('settings', 'VIEW', ['roles', 'pageAccess'])
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
