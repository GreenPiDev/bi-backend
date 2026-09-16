import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import type { DepartmentOption } from '@prisma/client';
import { RequiresModule } from '../../core/decorators/requires-module.decorator';
import { RequiresPermission } from '../../core/decorators/requires-permission.decorator';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import {
  CreateDepartmentOptionSchema,
  type CreateDepartmentOptionDto,
} from './dto/department-option.dto';
import { DepartmentOptionsService } from './department-options.service';

@RequiresModule('crm')
@Controller('department-options')
export class DepartmentOptionsController {
  constructor(private readonly departmentOptions: DepartmentOptionsService) {}

  @Get()
  list(): Promise<DepartmentOption[]> {
    return this.departmentOptions.list();
  }

  @Post()
  @RequiresPermission('settings', 'UPDATE')
  create(
    @Body(new ZodValidationPipe(CreateDepartmentOptionSchema))
    dto: CreateDepartmentOptionDto,
  ): Promise<DepartmentOption> {
    return this.departmentOptions.create(dto);
  }

  @Delete(':id')
  @RequiresPermission('settings', 'UPDATE')
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.departmentOptions.remove(id);
  }
}
