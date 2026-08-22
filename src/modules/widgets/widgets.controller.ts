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
import type { Widget } from '@prisma/client';
import { Roles } from '../../core/decorators/roles.decorator';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import {
  CreateWidgetSchema,
  UpdateWidgetSchema,
  type CreateWidgetDto,
  type UpdateWidgetDto,
} from './dto/widget.dto';
import { WidgetsService } from './widgets.service';

@Controller('dashboards/:dashboardId/widgets')
export class WidgetsController {
  constructor(private readonly widgets: WidgetsService) {}

  @Get()
  list(@Param('dashboardId') dashboardId: string): Promise<Widget[]> {
    return this.widgets.list(dashboardId);
  }

  @Post()
  @Roles('OWNER', 'ADMIN', 'EDITOR')
  create(
    @Param('dashboardId') dashboardId: string,
    @Body(new ZodValidationPipe(CreateWidgetSchema)) dto: CreateWidgetDto,
  ): Promise<Widget> {
    return this.widgets.create(dashboardId, dto);
  }

  @Patch(':id')
  @Roles('OWNER', 'ADMIN', 'EDITOR')
  update(
    @Param('dashboardId') dashboardId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateWidgetSchema)) dto: UpdateWidgetDto,
  ): Promise<Widget> {
    return this.widgets.update(dashboardId, id, dto);
  }

  @Delete(':id')
  @Roles('OWNER', 'ADMIN', 'EDITOR')
  @HttpCode(204)
  remove(
    @Param('dashboardId') dashboardId: string,
    @Param('id') id: string,
  ): Promise<void> {
    return this.widgets.remove(dashboardId, id);
  }
}
