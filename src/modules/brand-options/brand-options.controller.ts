import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { BrandOption } from '@prisma/client';
import { RequiresModule } from '../../core/decorators/requires-module.decorator';
import { RequiresPermission } from '../../core/decorators/requires-permission.decorator';
import {
  ListQuerySchema,
  type ListQueryDto,
  type PagedResult,
} from '../../core/dto/list-query.dto';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import {
  CreateBrandOptionSchema,
  UpdateBrandOptionSchema,
  type CreateBrandOptionDto,
  type UpdateBrandOptionDto,
} from './dto/brand-option.dto';
import { BrandOptionsService } from './brand-options.service';

@RequiresModule('crm')
@Controller('brand-options')
export class BrandOptionsController {
  constructor(private readonly brandOptions: BrandOptionsService) {}

  @Get()
  list(): Promise<BrandOption[]> {
    return this.brandOptions.list();
  }

  @Get('browse')
  browse(
    @Query(new ZodValidationPipe(ListQuerySchema)) query: ListQueryDto,
  ): Promise<PagedResult<BrandOption>> {
    return this.brandOptions.browse(query);
  }

  @Post()
  @RequiresPermission('settings', 'UPDATE')
  create(
    @Body(new ZodValidationPipe(CreateBrandOptionSchema))
    dto: CreateBrandOptionDto,
  ): Promise<BrandOption> {
    return this.brandOptions.create(dto);
  }

  @Patch(':id')
  @RequiresPermission('settings', 'UPDATE')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateBrandOptionSchema))
    dto: UpdateBrandOptionDto,
  ): Promise<BrandOption> {
    return this.brandOptions.update(id, dto);
  }

  @Delete(':id')
  @RequiresPermission('settings', 'UPDATE')
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.brandOptions.remove(id);
  }
}
