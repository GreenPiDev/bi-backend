import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PlatformAdminGuard } from '../../core/guards/platform-admin.guard';
import type { ModuleDefinition } from '../../core/modules/module-registry';
import type { PageModuleAssignment } from '../../core/modules/page-modules.service';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import { CreateTenantDto, CreateTenantSchema } from './dto/create-tenant.dto';
import {
  ListTenantsQueryDto,
  ListTenantsQuerySchema,
} from './dto/list-tenants-query.dto';
import {
  ExtendDemoUserDto,
  ExtendDemoUserSchema,
} from './dto/extend-demo-user.dto';
import {
  SetPageModuleDto,
  SetPageModuleSchema,
} from './dto/set-page-module.dto';
import { ToggleModuleDto, ToggleModuleSchema } from './dto/toggle-module.dto';
import {
  UpdateTenantAdminEmailDto,
  UpdateTenantAdminEmailSchema,
} from './dto/update-tenant-admin-email.dto';
import {
  UpdateTenantSlugDto,
  UpdateTenantSlugSchema,
} from './dto/update-tenant-slug.dto';
import { PlatformAdminService } from './platform-admin.service';
import type { TenantModuleStatus } from '../tenants/tenants.service';
import type { DemoUserSummary, TenantSummary } from './platform-admin.service';

@UseGuards(PlatformAdminGuard)
@Controller('platform-admin')
export class PlatformAdminController {
  constructor(private readonly platformAdmin: PlatformAdminService) {}

  @Get('tenants')
  listTenants(
    @Query(new ZodValidationPipe(ListTenantsQuerySchema))
    query: ListTenantsQueryDto,
  ): Promise<TenantSummary[]> {
    return this.platformAdmin.listTenants(query.q);
  }

  @Get('demo-users')
  listDemoUsers(): Promise<DemoUserSummary[]> {
    return this.platformAdmin.listDemoUsers();
  }

  @Post('demo-users/:id/extend')
  extendDemoUser(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ExtendDemoUserSchema)) dto: ExtendDemoUserDto,
  ): Promise<DemoUserSummary> {
    return this.platformAdmin.extendDemoUser(id, dto);
  }

  @Post('demo-users/:id/deactivate')
  deactivateDemoUser(@Param('id') id: string): Promise<DemoUserSummary> {
    return this.platformAdmin.deactivateDemoUser(id);
  }

  @Post('tenants')
  createTenant(
    @Body(new ZodValidationPipe(CreateTenantSchema)) dto: CreateTenantDto,
  ): Promise<{ tenant: TenantSummary; temporaryPassword: string }> {
    return this.platformAdmin.createTenant(dto);
  }

  @Post('tenants/:id/reset-admin-password')
  resetAdminPassword(
    @Param('id') id: string,
  ): Promise<{ temporaryPassword: string }> {
    return this.platformAdmin.resetAdminPassword(id);
  }

  @Patch('tenants/:id/slug')
  updateTenantSlug(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateTenantSlugSchema))
    dto: UpdateTenantSlugDto,
  ): Promise<TenantSummary> {
    return this.platformAdmin.updateTenantSlug(id, dto.slug);
  }

  @Patch('tenants/:id/admin-email')
  updateTenantAdminEmail(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateTenantAdminEmailSchema))
    dto: UpdateTenantAdminEmailDto,
  ): Promise<TenantSummary> {
    return this.platformAdmin.updateTenantAdminEmail(id, dto.email);
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

  @Post('cache/flush-all')
  flushAllTenantCaches(): Promise<{ deletedKeyCount: number }> {
    return this.platformAdmin.flushAllTenantCaches();
  }
}
