import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ModulePage } from '../../core/decorators/module-page.decorator';
import { RequiresPermission } from '../../core/decorators/requires-permission.decorator';
import type { PagedResult } from '../../core/dto/list-query.dto';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import {
  DecreaseStockSchema,
  IncreaseStockSchema,
  StockHistoryQuerySchema,
  StockItemQuerySchema,
  TransferStockSchema,
  type DecreaseStockDto,
  type IncreaseStockDto,
  type StockHistoryQueryDto,
  type StockItemQueryDto,
  type TransferStockDto,
} from './dto/stock-item.dto';
import {
  StockItemsService,
  type StockItemWithProduct,
  type StockMovementView,
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

  @Get('history')
  @RequiresPermission('stock', 'VIEW')
  listHistory(
    @Query(new ZodValidationPipe(StockHistoryQuerySchema))
    query: StockHistoryQueryDto,
  ): Promise<StockMovementView[]> {
    return this.stockItems.listHistory(query);
  }

  @Get()
  @RequiresPermission('stock', 'VIEW')
  list(
    @Query(new ZodValidationPipe(StockItemQuerySchema))
    query: StockItemQueryDto,
  ): Promise<PagedResult<StockItemWithProduct>> {
    return this.stockItems.list(query);
  }

  @Post(':productId/increase')
  @RequiresPermission('stock', 'UPDATE')
  increase(
    @Param('productId') productId: string,
    @Body(new ZodValidationPipe(IncreaseStockSchema))
    dto: IncreaseStockDto,
  ): Promise<StockItemWithProduct> {
    return this.stockItems.increaseStock(productId, dto);
  }

  @Post(':productId/decrease')
  @RequiresPermission('stock', 'UPDATE')
  decrease(
    @Param('productId') productId: string,
    @Body(new ZodValidationPipe(DecreaseStockSchema))
    dto: DecreaseStockDto,
  ): Promise<StockItemWithProduct> {
    return this.stockItems.decreaseStock(productId, dto);
  }

  @Post(':productId/transfer')
  @RequiresPermission('stock', 'UPDATE')
  transfer(
    @Param('productId') productId: string,
    @Body(new ZodValidationPipe(TransferStockSchema))
    dto: TransferStockDto,
  ): Promise<StockItemWithProduct> {
    return this.stockItems.transferStock(productId, dto);
  }
}
