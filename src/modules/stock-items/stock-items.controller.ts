import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ModulePage } from '../../core/decorators/module-page.decorator';
import { RequiresPermission } from '../../core/decorators/requires-permission.decorator';
import type { PagedResult } from '../../core/dto/list-query.dto';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import {
  DecreaseStockSchema,
  IncreaseStockSchema,
  StockHistoryQuerySchema,
  StockHoldingCostLogQuerySchema,
  StockItemQuerySchema,
  TransferStockSchema,
  WarehouseStockQuerySchema,
  type DecreaseStockDto,
  type IncreaseStockDto,
  type StockHistoryQueryDto,
  type StockHoldingCostLogQueryDto,
  type StockItemQueryDto,
  type TransferStockDto,
  type WarehouseStockQueryDto,
} from './dto/stock-item.dto';
import {
  StockItemsService,
  type StockHoldingCostLogView,
  type StockItemWithProduct,
  type StockMovementView,
  type WarehouseStockRow,
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
  ): Promise<PagedResult<StockMovementView>> {
    return this.stockItems.listHistory(query);
  }

  @Get('by-warehouse/:warehouseId')
  @RequiresPermission('stock', 'VIEW')
  listByWarehouse(
    @Param('warehouseId') warehouseId: string,
    @Query(new ZodValidationPipe(WarehouseStockQuerySchema))
    query: WarehouseStockQueryDto,
  ): Promise<PagedResult<WarehouseStockRow>> {
    return this.stockItems.listByWarehouse(warehouseId, query);
  }

  @Get('holding-cost-log')
  @RequiresPermission('stock', 'VIEW')
  listHoldingCostLogs(
    @Query(new ZodValidationPipe(StockHoldingCostLogQuerySchema))
    query: StockHoldingCostLogQueryDto,
  ): Promise<PagedResult<StockHoldingCostLogView>> {
    return this.stockItems.listHoldingCostLogs(query);
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
