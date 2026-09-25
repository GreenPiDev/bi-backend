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
import type { TitleOption } from '@prisma/client';
import { RequiresModule } from '../../core/decorators/requires-module.decorator';
import { RequiresPermission } from '../../core/decorators/requires-permission.decorator';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import {
  CreateTitleOptionSchema,
  UpdateTitleOptionSchema,
  type CreateTitleOptionDto,
  type UpdateTitleOptionDto,
} from './dto/title-option.dto';
import { TitleOptionsService } from './title-options.service';

@RequiresModule('crm')
@Controller('title-options')
export class TitleOptionsController {
  constructor(private readonly titleOptions: TitleOptionsService) {}

  @Get()
  list(): Promise<TitleOption[]> {
    return this.titleOptions.list();
  }

  @Post()
  @RequiresPermission('settings', 'UPDATE')
  create(
    @Body(new ZodValidationPipe(CreateTitleOptionSchema))
    dto: CreateTitleOptionDto,
  ): Promise<TitleOption> {
    return this.titleOptions.create(dto);
  }

  @Patch(':id')
  @RequiresPermission('settings', 'UPDATE')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateTitleOptionSchema))
    dto: UpdateTitleOptionDto,
  ): Promise<TitleOption> {
    return this.titleOptions.update(id, dto);
  }

  @Delete(':id')
  @RequiresPermission('settings', 'UPDATE')
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.titleOptions.remove(id);
  }
}
