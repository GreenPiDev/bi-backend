import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { PlatformAdminGuard } from '../../core/guards/platform-admin.guard';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
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
}
