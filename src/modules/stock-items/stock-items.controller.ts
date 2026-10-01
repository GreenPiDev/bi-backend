import {
  Body,
  Controller,
  Get,
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
  StockHistoryQuerySchema,
  StockItemQuerySchema,
  TransferStockSchema,
  UpsertStockItemSchema,
  type StockHistoryQueryDto,
  type StockItemQueryDto,
  type TransferStockDto,
  type UpsertStockItemDto,
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

  @Patch(':productId')
  @RequiresPermission('stock', 'UPDATE')
  upsert(
    @Param('productId') productId: string,
    @Body(new ZodValidationPipe(UpsertStockItemSchema))
    dto: UpsertStockItemDto,
  ): Promise<StockItemWithProduct> {
    return this.stockItems.upsertByProductId(productId, dto);
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
