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
import type { ReminderTypeOption } from '@prisma/client';
import { RequiresModule } from '../../core/decorators/requires-module.decorator';
import { RequiresPermission } from '../../core/decorators/requires-permission.decorator';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import {
  CreateReminderTypeOptionSchema,
  UpdateReminderTypeOptionSchema,
  type CreateReminderTypeOptionDto,
  type UpdateReminderTypeOptionDto,
} from './dto/reminder-type-option.dto';
import { ReminderTypeOptionsService } from './reminder-type-options.service';

@RequiresModule('crm')
@Controller('reminder-type-options')
export class ReminderTypeOptionsController {
  constructor(
    private readonly reminderTypeOptions: ReminderTypeOptionsService,
  ) {}

  @Get()
  list(): Promise<ReminderTypeOption[]> {
    return this.reminderTypeOptions.list();
  }

  @Post()
  @RequiresPermission('settings', 'UPDATE')
  create(
    @Body(new ZodValidationPipe(CreateReminderTypeOptionSchema))
    dto: CreateReminderTypeOptionDto,
  ): Promise<ReminderTypeOption> {
    return this.reminderTypeOptions.create(dto);
  }

  @Patch(':id')
  @RequiresPermission('settings', 'UPDATE')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateReminderTypeOptionSchema))
    dto: UpdateReminderTypeOptionDto,
  ): Promise<ReminderTypeOption> {
    return this.reminderTypeOptions.update(id, dto);
  }

  @Delete(':id')
  @RequiresPermission('settings', 'UPDATE')
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.reminderTypeOptions.remove(id);
  }
}
