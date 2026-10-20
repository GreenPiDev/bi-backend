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
import {
  CurrentUser,
  type RequestUser,
} from '../../core/decorators/current-user.decorator';
import { ModulePage } from '../../core/decorators/module-page.decorator';
import { RequiresPermission } from '../../core/decorators/requires-permission.decorator';
import type { PagedResult } from '../../core/dto/list-query.dto';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import {
  CreatePurchaseOrderSchema,
  PurchaseOrderQuerySchema,
  SetPurchaseOrderItemCancelledSchema,
  SetPurchaseOrderItemReceivedQuantitySchema,
  UpdatePurchaseOrderSchema,
  type CreatePurchaseOrderDto,
  type PurchaseOrderQueryDto,
  type SetPurchaseOrderItemCancelledDto,
  type SetPurchaseOrderItemReceivedQuantityDto,
  type UpdatePurchaseOrderDto,
} from './dto/purchase-order.dto';
import {
  PurchaseOrdersService,
  type PurchaseOrderWithItems,
} from './purchase-orders.service';

/**
 * SP1-SP2: onayli bir teklif icin QuotesController'daki
 * GET /quotes/:id/purchase-order-draft onerilen kalemleri dondurur (bkz.
 * PurchaseOrdersService.getDraftFromQuote) - herhangi bir kayit olusturmaz.
 * Kullanici bu oneriyle doldurulmus /siparisler/yeni formunu duzenleyip
 * buradaki POST /purchase-orders ile siparisi kendisi olusturur (teklife bagli
 * ya da bagsiz, PurchaseOrdersService.create).
 */
@ModulePage('purchase-orders')
@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(private readonly purchaseOrders: PurchaseOrdersService) {}

  @Post()
  @RequiresPermission('purchase-orders', 'CREATE')
  create(
    @Body(new ZodValidationPipe(CreatePurchaseOrderSchema))
    dto: CreatePurchaseOrderDto,
    @CurrentUser() user: RequestUser,
  ): Promise<PurchaseOrderWithItems> {
    return this.purchaseOrders.create(user.id, dto);
  }

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

  @Patch(':id/items/:itemId/received-quantity')
  @RequiresPermission('purchase-orders', 'UPDATE')
  setItemReceivedQuantity(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body(new ZodValidationPipe(SetPurchaseOrderItemReceivedQuantitySchema))
    dto: SetPurchaseOrderItemReceivedQuantityDto,
  ): Promise<PurchaseOrderWithItems> {
    return this.purchaseOrders.setItemReceivedQuantity(
      id,
      itemId,
      dto.receivedQuantity,
    );
  }

  @Patch(':id/items/:itemId/cancelled')
  @RequiresPermission('purchase-orders', 'UPDATE')
  setItemCancelled(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body(new ZodValidationPipe(SetPurchaseOrderItemCancelledSchema))
    dto: SetPurchaseOrderItemCancelledDto,
  ): Promise<PurchaseOrderWithItems> {
    return this.purchaseOrders.setItemCancelled(id, itemId, dto.isCancelled);
  }

  @Delete(':id')
  @RequiresPermission('purchase-orders', 'DELETE')
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.purchaseOrders.remove(id);
  }
}
