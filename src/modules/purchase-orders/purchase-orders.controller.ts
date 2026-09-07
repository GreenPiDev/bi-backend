import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import { ModulePage } from '../../core/decorators/module-page.decorator';
import { RequiresPermission } from '../../core/decorators/requires-permission.decorator';
import type { PagedResult } from '../../core/dto/list-query.dto';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import {
  PurchaseOrderQuerySchema,
  UpdatePurchaseOrderSchema,
  type PurchaseOrderQueryDto,
  type UpdatePurchaseOrderDto,
} from './dto/purchase-order.dto';
import {
  PurchaseOrdersService,
  type PurchaseOrderWithItems,
} from './purchase-orders.service';

/**
 * SP1: dogrudan bir POST /purchase-orders ucu YOK - siparis olusturma sadece
 * QuotesController'daki POST /quotes/:id/create-purchase-order uzerinden yapilir
 * (bkz. PurchaseOrdersService.createFromQuote).
 */
@ModulePage('purchase-orders')
@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(private readonly purchaseOrders: PurchaseOrdersService) {}

  @Get()
  @RequiresPermission('purchase-orders', 'VIEW')
  list(
    @Query(new ZodValidationPipe(PurchaseOrderQuerySchema))
    query: PurchaseOrderQueryDto,
  ): Promise<PagedResult<PurchaseOrderWithItems>> {
    return this.purchaseOrders.list(query);
  }

  @Get(':id')
  @RequiresPermission('purchase-orders', 'VIEW')
  getById(@Param('id') id: string): Promise<PurchaseOrderWithItems> {
    return this.purchaseOrders.getById(id);
  }

  @Patch(':id')
  @RequiresPermission('purchase-orders', 'UPDATE')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdatePurchaseOrderSchema))
    dto: UpdatePurchaseOrderDto,
  ): Promise<PurchaseOrderWithItems> {
    return this.purchaseOrders.update(id, dto);
  }

  @Delete(':id')
  @RequiresPermission('purchase-orders', 'DELETE')
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.purchaseOrders.remove(id);
  }
}
