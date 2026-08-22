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
import type { Alert } from '@prisma/client';
import {
  CurrentUser,
  type RequestUser,
} from '../../core/decorators/current-user.decorator';
import { Roles } from '../../core/decorators/roles.decorator';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import {
  CreateAlertSchema,
  UpdateAlertSchema,
  type CreateAlertDto,
  type UpdateAlertDto,
} from './dto/alert.dto';
import { AlertsService } from './alerts.service';

@Controller('alerts')
@Roles('OWNER', 'ADMIN')
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @Get()
  list(): Promise<Alert[]> {
    return this.alerts.list();
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(CreateAlertSchema)) dto: CreateAlertDto,
    @CurrentUser() user: RequestUser,
  ): Promise<Alert> {
    return this.alerts.create(user.tenantId, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateAlertSchema)) dto: UpdateAlertDto,
  ): Promise<Alert> {
    return this.alerts.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.alerts.remove(id);
  }
}
