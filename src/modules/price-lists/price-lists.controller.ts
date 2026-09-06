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
import { ModulePage } from '../../core/decorators/module-page.decorator';
import { RequiresPermission } from '../../core/decorators/requires-permission.decorator';
import type { PagedResult } from '../../core/dto/list-query.dto';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import {
  CreatePriceListSchema,
  PriceListQuerySchema,
  UpdatePriceListSchema,
  type CreatePriceListDto,
  type PriceListQueryDto,
  type UpdatePriceListDto,
} from './dto/price-list.dto';
import {
  PriceListsService,
  type PriceListWithItems,
} from './price-lists.service';

@ModulePage('price-lists')
@Controller('price-lists')
export class PriceListsController {
  constructor(private readonly priceLists: PriceListsService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(PriceListQuerySchema))
    query: PriceListQueryDto,
  ): Promise<PagedResult<PriceListWithItems>> {
    return this.priceLists.list(query);
  }

  @Get(':id')
  getById(@Param('id') id: string): Promise<PriceListWithItems> {
    return this.priceLists.getById(id);
  }

  @Post()
  @RequiresPermission('price-lists', 'CREATE')
  create(
    @Body(new ZodValidationPipe(CreatePriceListSchema))
    dto: CreatePriceListDto,
  ): Promise<PriceListWithItems> {
    return this.priceLists.create(dto);
  }

  @Patch(':id')
  @RequiresPermission('price-lists', 'UPDATE')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdatePriceListSchema))
    dto: UpdatePriceListDto,
  ): Promise<PriceListWithItems> {
    return this.priceLists.update(id, dto);
  }

  @Delete(':id')
  @RequiresPermission('price-lists', 'DELETE')
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.priceLists.remove(id);
  }
}
