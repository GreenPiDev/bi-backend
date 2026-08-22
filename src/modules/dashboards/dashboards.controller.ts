import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import type { Dashboard } from '@prisma/client';
import {
  CurrentUser,
  type RequestUser,
} from '../../core/decorators/current-user.decorator';
import { Roles } from '../../core/decorators/roles.decorator';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import {
  DashboardsService,
  type DashboardWithWidgets,
} from './dashboards.service';
import {
  CreateDashboardSchema,
  UpdateDashboardSchema,
  type CreateDashboardDto,
  type UpdateDashboardDto,
} from './dto/dashboard.dto';

@Controller('dashboards')
export class DashboardsController {
  constructor(private readonly dashboards: DashboardsService) {}

  @Get()
  list(): Promise<Dashboard[]> {
    return this.dashboards.list();
  }

  @Get(':id')
  getById(@Param('id') id: string): Promise<DashboardWithWidgets> {
    return this.dashboards.getById(id);
  }

  @Post()
  @Roles('OWNER', 'ADMIN', 'EDITOR')
  create(
    @Body(new ZodValidationPipe(CreateDashboardSchema)) dto: CreateDashboardDto,
    @CurrentUser() user: RequestUser,
  ): Promise<Dashboard> {
    return this.dashboards.create(user.tenantId, user.id, dto);
  }

  @Patch(':id')
  @Roles('OWNER', 'ADMIN', 'EDITOR')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateDashboardSchema)) dto: UpdateDashboardDto,
  ): Promise<DashboardWithWidgets> {
    return this.dashboards.update(id, dto);
  }

  @Delete(':id')
  @Roles('OWNER', 'ADMIN', 'EDITOR')
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.dashboards.remove(id);
  }
}
