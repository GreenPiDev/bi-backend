import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { PlatformAdminGuard } from '../../core/guards/platform-admin.guard';
import type { ModuleDefinition } from '../../core/modules/module-registry';
import type { PageModuleAssignment } from '../../core/modules/page-modules.service';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import {
  SetPageModuleDto,
  SetPageModuleSchema,
} from './dto/set-page-module.dto';
import { ToggleModuleDto, ToggleModuleSchema } from './dto/toggle-module.dto';
import { PlatformAdminService } from './platform-admin.service';
import type { TenantModuleStatus } from '../tenants/tenants.service';
import type { TenantSummary } from './platform-admin.service';

@UseGuards(PlatformAdminGuard)
@Controller('platform-admin')
export class PlatformAdminController {
  constructor(private readonly platformAdmin: PlatformAdminService) {}

  @Get('tenants')
  listTenants(): Promise<TenantSummary[]> {
    return this.platformAdmin.listTenants();
  }

  @Get('tenants/:id/modules')
  listTenantModules(@Param('id') id: string): Promise<TenantModuleStatus[]> {
    return this.platformAdmin.listTenantModules(id);
  }

  @Patch('tenants/:id/modules/:key')
  setTenantModule(
    @Param('id') id: string,
    @Param('key') key: string,
    @Body(new ZodValidationPipe(ToggleModuleSchema)) dto: ToggleModuleDto,
  ): Promise<TenantModuleStatus[]> {
    return this.platformAdmin.setTenantModule(id, key, dto.enabled);
  }

  @Get('modules')
  listModuleDefinitions(): readonly ModuleDefinition[] {
    return this.platformAdmin.listModuleDefinitions();
  }

  @Get('page-modules')
  listPageModules(): Promise<PageModuleAssignment[]> {
    return this.platformAdmin.listPageModules();
  }

  @Patch('page-modules/:pageKey')
  setPageModule(
    @Param('pageKey') pageKey: string,
    @Body(new ZodValidationPipe(SetPageModuleSchema)) dto: SetPageModuleDto,
  ): Promise<PageModuleAssignment[]> {
    return this.platformAdmin.setPageModule(pageKey, dto.moduleKeys);
  }
}
