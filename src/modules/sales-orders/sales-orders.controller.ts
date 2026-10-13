import {
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Body,
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
  CreateSalesOrderSchema,
  SalesOrderQuerySchema,
  UpdateSalesOrderSchema,
  type CreateSalesOrderDto,
  type SalesOrderQueryDto,
  type UpdateSalesOrderDto,
} from './dto/sales-order.dto';
import {
  SalesOrdersService,
  type SalesOrderWithQuote,
} from './sales-orders.service';

/**
 * Ad-hoc: Satis Siparisi (kullanici istegi, bkz. CLAUDE.md). DELETE ucu YOK.
 * SalesOrder normalde Quote APPROVED olunca QuotesService.ensureSalesOrder
 * tarafindan otomatik olusturulur; POST burada ya (quoteId ile) bu otomasyondan
 * ONCE onaylanmis eski tekliflerin elle backfill edilmesi, ya da (accountId +
 * items ile) hic teklife bagli olmayan tamamen manuel bir siparis icin var
 * (bkz. SalesOrdersService.create() doc comment'i).
 */
@ModulePage('sales-orders')
@Controller('sales-orders')
export class SalesOrdersController {
  constructor(private readonly salesOrders: SalesOrdersService) {}

  @Post()
  @RequiresPermission('sales-orders', 'CREATE')
  create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(CreateSalesOrderSchema))
    dto: CreateSalesOrderDto,
  ): Promise<SalesOrderWithQuote> {
    return this.salesOrders.create(user.id, dto);
  }

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
