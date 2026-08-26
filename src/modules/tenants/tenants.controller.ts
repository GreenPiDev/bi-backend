import { Controller, Get } from '@nestjs/common';
import {
  CurrentUser,
  type RequestUser,
} from '../../core/decorators/current-user.decorator';
import { TenantsService, type TenantModuleStatus } from './tenants.service';

@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Get('me/modules')
  listMyModules(
    @CurrentUser() user: RequestUser,
  ): Promise<TenantModuleStatus[]> {
    return this.tenants.listModules(user.tenantId);
  }
}
