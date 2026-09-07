import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ModulePage } from '../../core/decorators/module-page.decorator';
import { RequiresPermission } from '../../core/decorators/requires-permission.decorator';
import type { PagedResult } from '../../core/dto/list-query.dto';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import {
  StockItemQuerySchema,
  UpsertStockItemSchema,
  type StockItemQueryDto,
  type UpsertStockItemDto,
} from './dto/stock-item.dto';
import {
  StockItemsService,
  type StockItemWithProduct,
} from './stock-items.service';

@ModulePage('stock')
@Controller('stock-items')
export class StockItemsController {
  constructor(private readonly stockItems: StockItemsService) {}

  @Get('low-stock')
  @RequiresPermission('stock', 'VIEW')
  listLowStock(): Promise<StockItemWithProduct[]> {
    return this.stockItems.listLowStock();
  }

  @Get()
  @RequiresPermission('stock', 'VIEW')
  list(
    @Query(new ZodValidationPipe(StockItemQuerySchema))
    query: StockItemQueryDto,
  ): Promise<PagedResult<StockItemWithProduct>> {
    return this.stockItems.list(query);
  }

  @Patch(':productId')
  @RequiresPermission('stock', 'UPDATE')
  upsert(
    @Param('productId') productId: string,
    @Body(new ZodValidationPipe(UpsertStockItemSchema))
    dto: UpsertStockItemDto,
  ): Promise<StockItemWithProduct> {
    return this.stockItems.upsertByProductId(productId, dto);
  }
}
