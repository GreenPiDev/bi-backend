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
import type { IbanOptionGroup } from '@prisma/client';
import { RequiresModule } from '../../core/decorators/requires-module.decorator';
import { RequiresPermission } from '../../core/decorators/requires-permission.decorator';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import {
  IbanOptionGroupSchema,
  type IbanOptionGroupDto,
} from './dto/iban-option-group.dto';
import { IbanOptionGroupsService } from './iban-option-groups.service';

@RequiresModule('crm')
@Controller('iban-option-groups')
export class IbanOptionGroupsController {
  constructor(private readonly ibanOptionGroups: IbanOptionGroupsService) {}

  @Get()
  list(): Promise<IbanOptionGroup[]> {
    return this.ibanOptionGroups.list();
  }

  @Post()
  @RequiresPermission('settings', 'UPDATE')
  create(
    @Body(new ZodValidationPipe(IbanOptionGroupSchema))
    dto: IbanOptionGroupDto,
  ): Promise<IbanOptionGroup> {
    return this.ibanOptionGroups.create(dto);
  }

  @Patch(':id')
  @RequiresPermission('settings', 'UPDATE')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(IbanOptionGroupSchema))
    dto: IbanOptionGroupDto,
  ): Promise<IbanOptionGroup> {
    return this.ibanOptionGroups.update(id, dto);
  }

  @Delete(':id')
  @RequiresPermission('settings', 'UPDATE')
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.ibanOptionGroups.remove(id);
  }
}
