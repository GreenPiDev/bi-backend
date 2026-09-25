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
import type { IbanOption } from '@prisma/client';
import { RequiresModule } from '../../core/decorators/requires-module.decorator';
import { RequiresPermission } from '../../core/decorators/requires-permission.decorator';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import { IbanOptionSchema, type IbanOptionDto } from './dto/iban-option.dto';
import { IbanOptionsService } from './iban-options.service';

@RequiresModule('crm')
@Controller('iban-options')
export class IbanOptionsController {
  constructor(private readonly ibanOptions: IbanOptionsService) {}

  @Get()
  list(): Promise<IbanOption[]> {
    return this.ibanOptions.list();
  }

  @Post()
  @RequiresPermission('settings', 'UPDATE')
  create(
    @Body(new ZodValidationPipe(IbanOptionSchema)) dto: IbanOptionDto,
  ): Promise<IbanOption> {
    return this.ibanOptions.create(dto);
  }

  @Patch(':id')
  @RequiresPermission('settings', 'UPDATE')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(IbanOptionSchema)) dto: IbanOptionDto,
  ): Promise<IbanOption> {
    return this.ibanOptions.update(id, dto);
  }

  @Delete(':id')
  @RequiresPermission('settings', 'UPDATE')
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.ibanOptions.remove(id);
  }
}
