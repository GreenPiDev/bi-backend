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
import type { InteractionTypeOption } from '@prisma/client';
import { RequiresModule } from '../../core/decorators/requires-module.decorator';
import { RequiresPermission } from '../../core/decorators/requires-permission.decorator';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import {
  CreateInteractionTypeOptionSchema,
  UpdateInteractionTypeOptionSchema,
  type CreateInteractionTypeOptionDto,
  type UpdateInteractionTypeOptionDto,
} from './dto/interaction-type-option.dto';
import { InteractionTypeOptionsService } from './interaction-type-options.service';

@RequiresModule('crm')
@Controller('interaction-type-options')
export class InteractionTypeOptionsController {
  constructor(
    private readonly interactionTypeOptions: InteractionTypeOptionsService,
  ) {}

  @Get()
  list(): Promise<InteractionTypeOption[]> {
    return this.interactionTypeOptions.list();
  }

  @Post()
  @RequiresPermission('settings', 'UPDATE')
  create(
    @Body(new ZodValidationPipe(CreateInteractionTypeOptionSchema))
    dto: CreateInteractionTypeOptionDto,
  ): Promise<InteractionTypeOption> {
    return this.interactionTypeOptions.create(dto);
  }

  @Patch(':id')
  @RequiresPermission('settings', 'UPDATE')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateInteractionTypeOptionSchema))
    dto: UpdateInteractionTypeOptionDto,
  ): Promise<InteractionTypeOption> {
    return this.interactionTypeOptions.update(id, dto);
  }

  @Delete(':id')
  @RequiresPermission('settings', 'UPDATE')
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.interactionTypeOptions.remove(id);
  }
}
