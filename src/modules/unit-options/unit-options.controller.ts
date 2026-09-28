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
import type { UnitOption } from '@prisma/client';
import { RequiresModule } from '../../core/decorators/requires-module.decorator';
import { RequiresPermission } from '../../core/decorators/requires-permission.decorator';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import {
  CreateUnitOptionSchema,
  UpdateUnitOptionSchema,
  type CreateUnitOptionDto,
  type UpdateUnitOptionDto,
} from './dto/unit-option.dto';
import { UnitOptionsService } from './unit-options.service';

@RequiresModule('crm')
@Controller('unit-options')
export class UnitOptionsController {
  constructor(private readonly unitOptions: UnitOptionsService) {}

  @Get()
  list(): Promise<UnitOption[]> {
    return this.unitOptions.list();
  }

  @Post()
  @RequiresPermission('settings', 'UPDATE')
  create(
    @Body(new ZodValidationPipe(CreateUnitOptionSchema))
    dto: CreateUnitOptionDto,
  ): Promise<UnitOption> {
    return this.unitOptions.create(dto);
  }

  @Patch(':id')
  @RequiresPermission('settings', 'UPDATE')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateUnitOptionSchema))
    dto: UpdateUnitOptionDto,
  ): Promise<UnitOption> {
    return this.unitOptions.update(id, dto);
  }

  @Delete(':id')
  @RequiresPermission('settings', 'UPDATE')
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.unitOptions.remove(id);
  }
}
