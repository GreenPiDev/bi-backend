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
  PurchaseOrdersService,
  type PurchaseOrderWithItems,
} from '../purchase-orders/purchase-orders.service';
import {
  CreateQuoteSchema,
  FxRatesQuerySchema,
  QuoteQuerySchema,
  UpdateQuoteSchema,
  type CreateQuoteDto,
  type FxRatesQueryDto,
  type QuoteQueryDto,
  type UpdateQuoteDto,
} from './dto/quote.dto';
import {
  QuotesService,
  type QuotePrintData,
  type QuoteWithDetails,
} from './quotes.service';
import type { FxRatesResult } from '../../core/fx/fx.service';

@ModulePage('quotes')
@Controller('quotes')
export class QuotesController {
  constructor(
    private readonly quotes: QuotesService,
    private readonly purchaseOrders: PurchaseOrdersService,
  ) {}

  @Get()
  @RequiresPermission('quotes', 'VIEW')
  list(
    @Query(new ZodValidationPipe(QuoteQuerySchema)) query: QuoteQueryDto,
  ): Promise<PagedResult<QuoteWithDetails>> {
    return this.quotes.list(query);
  }

  /** Teklif para birimi secimi icin guncel kur (otomatik on-doldurma, kullanici elle
   * duzenleyebilir - bkz. Quote.exchangeRates doc comment'i). `:id` route'undan once
   * tanimlanmali, aksi halde "fx-rates" bir teklif id'si gibi yakalanir. */
  @Get('fx-rates')
  @RequiresPermission('quotes', 'VIEW')
  getFxRates(
    @Query(new ZodValidationPipe(FxRatesQuerySchema)) query: FxRatesQueryDto,
  ): Promise<FxRatesResult> {
    return this.quotes.getFxRates(query.base, query.targets);
  }

  @Get(':id')
  @RequiresPermission('quotes', 'VIEW')
  getById(@Param('id') id: string): Promise<QuoteWithDetails> {
    return this.quotes.getById(id);
  }

  /** Markali PDF yazdirma sayfasi (quote-template-print-page.tsx) icin tek seferlik
   * veri ucu - bkz. docs/VARSAYIMLAR.md V41. */
  @Get(':id/print-data')
  @RequiresPermission('quotes', 'VIEW')
  getPrintData(@Param('id') id: string): Promise<QuotePrintData> {
    return this.quotes.getPrintData(id);
  }

  @Post()
  @RequiresPermission('quotes', 'CREATE')
  create(
    @Body(new ZodValidationPipe(CreateQuoteSchema)) dto: CreateQuoteDto,
    @CurrentUser() user: RequestUser,
  ): Promise<QuoteWithDetails> {
    return this.quotes.create(user.id, dto);
  }

  @Patch(':id')
  @RequiresPermission('quotes', 'UPDATE')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateQuoteSchema)) dto: UpdateQuoteDto,
    @CurrentUser() user: RequestUser,
  ): Promise<QuoteWithDetails> {
    return this.quotes.update(id, dto, user.id);
  }

  @Delete(':id')
  @RequiresPermission('quotes', 'DELETE')
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.quotes.remove(id);
  }

  @Post(':id/approve')
  @RequiresPermission('quotes', 'APPROVE')
  approve(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<QuoteWithDetails> {
    return this.quotes.approve(id, user.id);
  }

  @Post(':id/reject')
  @RequiresPermission('quotes', 'APPROVE')
  reject(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<QuoteWithDetails> {
    return this.quotes.reject(id, user.id);
  }

  /** SP1: onayli bir teklifden satin alma siparisi olusturur (bkz. PurchaseOrdersService). */
  @Post(':id/create-purchase-order')
  @RequiresPermission('purchase-orders', 'CREATE')
  createPurchaseOrder(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<PurchaseOrderWithItems> {
    return this.purchaseOrders.createFromQuote(user.id, id);
  }
}
