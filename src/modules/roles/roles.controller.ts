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
  PAGE_REGISTRY,
  type PageDefinition,
} from '../../core/modules/page-registry';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import { CreateRoleSchema, UpdateRoleSchema } from './dto/role.dto';
import type { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';
import { RolesService, type RoleView } from './roles.service';

@UseGuards(CompanyAdminGuard)
@Controller()
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get('page-registry')
  pageRegistry(): readonly PageDefinition[] {
    return PAGE_REGISTRY;
  }

  @Get('roles')
  list(): Promise<RoleView[]> {
    return this.roles.list();
  }

  @Post('roles')
  create(
    @Body(new ZodValidationPipe(CreateRoleSchema)) dto: CreateRoleDto,
  ): Promise<RoleView> {
    return this.roles.create(dto);
  }

  @Patch('roles/:id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateRoleSchema)) dto: UpdateRoleDto,
  ): Promise<RoleView> {
    return this.roles.update(id, dto);
  }

  @Delete('roles/:id')
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.roles.remove(id);
  }
}
