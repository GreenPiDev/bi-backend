import { Controller, Get, Param, Patch, Body, Query } from '@nestjs/common';
import { ModulePage } from '../../core/decorators/module-page.decorator';
import { RequiresPermission } from '../../core/decorators/requires-permission.decorator';
import type { PagedResult } from '../../core/dto/list-query.dto';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import {
  SalesOrderQuerySchema,
  UpdateSalesOrderSchema,
  type SalesOrderQueryDto,
  type UpdateSalesOrderDto,
} from './dto/sales-order.dto';
import {
  SalesOrdersService,
  type SalesOrderWithQuote,
} from './sales-orders.service';

/**
 * Ad-hoc: Satis Siparisi (kullanici istegi, bkz. CLAUDE.md). CREATE/DELETE ucu YOK -
 * SalesOrder sadece Quote APPROVED olunca QuotesService.ensureSalesOrder tarafindan
 * otomatik olusturulur, buradan sadece okunur/durumu guncellenir.
 */
@ModulePage('sales-orders')
@Controller('sales-orders')
export class SalesOrdersController {
  constructor(private readonly salesOrders: SalesOrdersService) {}

  @Get()
  @RequiresPermission('sales-orders', 'VIEW')
  list(
    @Query(new ZodValidationPipe(SalesOrderQuerySchema))
    query: SalesOrderQueryDto,
  ): Promise<PagedResult<SalesOrderWithQuote>> {
    return this.salesOrders.list(query);
  }

  @Get(':id')
  @RequiresPermission('sales-orders', 'VIEW')
  getById(@Param('id') id: string): Promise<SalesOrderWithQuote> {
    return this.salesOrders.getById(id);
  }

  @Patch(':id')
  @RequiresPermission('sales-orders', 'UPDATE')
  updateStatus(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateSalesOrderSchema))
    dto: UpdateSalesOrderDto,
  ): Promise<SalesOrderWithQuote> {
    return this.salesOrders.updateStatus(id, dto);
  }
}
