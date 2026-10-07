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
  type PurchaseOrderDraft,
} from '../purchase-orders/purchase-orders.service';
import {
  ApproveQuoteSchema,
  CreateQuoteSchema,
  FxRatesQuerySchema,
  QuoteQuerySchema,
  RejectQuoteSchema,
  UpdateQuoteSchema,
  type ApproveQuoteDto,
  type CreateQuoteDto,
  type FxRatesQueryDto,
  type QuoteQueryDto,
  type RejectQuoteDto,
  type UpdateQuoteDto,
} from './dto/quote.dto';
import {
  QuotesService,
  type QuotePrintData,
  type QuoteStatusHistoryEntry,
  type QuoteStockCheckResult,
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

  /** Ad-hoc revizyon takibi: /teklifler/yeni'deki firma bazli uyari icin - `:id`
   * route'undan once tanimlanmali, aksi halde "revision-summary" bir teklif id'si
   * gibi yakalanir (bkz. fx-rates ile ayni desen). */
  @Get('revision-summary')
  @RequiresPermission('quotes', 'VIEW')
  getRevisionSummary(
    @Query('accountId') accountId: string,
  ): Promise<{ count: number }> {
    return this.quotes.getRevisionSummaryForAccount(accountId);
  }

  /** /teklifler/yeni ve /teklifler/duzenle/:id'deki "Gonderen" secicisi - `:id`
   * route'undan once tanimlanmali, ayni desen (bkz. fx-rates/revision-summary). */
  @Get('assignable-users')
  @RequiresPermission('quotes', 'VIEW')
  listAssignableUsers(): Promise<
    {
      id: string;
      name: string;
      title: string | null;
      phone: string | null;
      email: string;
    }[]
  > {
    return this.quotes.listAssignableUsers();
  }

  /** /teklifler?tab=reports "Reddedilme Sebepleri" pasta grafigi - `:id` route'undan
   * once tanimlanmali, ayni desen (bkz. fx-rates/revision-summary/assignable-users). */
  @Get('rejection-reasons-summary')
  @RequiresPermission('quotes', 'VIEW')
  getRejectionReasonsSummary(): Promise<
    { reason: string | null; count: number }[]
  > {
    return this.quotes.getRejectionReasonsSummary();
  }

  /** /teklifler?tab=reports "Reddedilme Notları" collapsible tablosu - `:id` route'undan
   * once tanimlanmali, ayni desen (bkz. fx-rates/revision-summary/rejection-reasons-summary). */
  @Get('rejected-reasons-list')
  @RequiresPermission('quotes', 'VIEW')
  getRejectedQuotesWithReasons(): Promise<
    {
      id: string;
      quoteNumber: string;
      accountName: string;
      rejectedAt: Date | null;
      reason: string | null;
      note: string | null;
    }[]
  > {
    return this.quotes.getRejectedQuotesWithReasons();
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

  /** /teklifler/:id "Durum" sekmesi icin durum gecmisi. */
  @Get(':id/status-history')
  @RequiresPermission('quotes', 'VIEW')
  getStatusHistory(
    @Param('id') id: string,
  ): Promise<QuoteStatusHistoryEntry[]> {
    return this.quotes.getStatusHistory(id);
  }

  /** /teklifler/:id "Stok Kontrolu" sekmesi icin teklif kalemleri + depo bazli
   * mevcut stok miktarlari. */
  @Get(':id/stock-check')
  @RequiresPermission('quotes', 'VIEW')
  getStockCheck(@Param('id') id: string): Promise<QuoteStockCheckResult> {
    return this.quotes.getStockCheck(id);
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
    @Body(new ZodValidationPipe(ApproveQuoteSchema)) dto: ApproveQuoteDto,
    @CurrentUser() user: RequestUser,
  ): Promise<QuoteWithDetails> {
    return this.quotes.approve(id, user.id, dto);
  }

  @Post(':id/reject')
  @RequiresPermission('quotes', 'APPROVE')
  reject(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(RejectQuoteSchema)) dto: RejectQuoteDto,
    @CurrentUser() user: RequestUser,
  ): Promise<QuoteWithDetails> {
    return this.quotes.reject(id, user.id, dto);
  }

  /** SP1-SP2: onayli bir teklif icin onerilen satin alma siparisi kalemlerini
   * (urun + stoktan dusulmus miktar) dondurur - herhangi bir kayit OLUSTURMAZ.
   * Kullanici /siparisler/yeni formunu bu onerilerle doldurup, basligi/kalemleri
   * duzenleyip kendisi POST /purchase-orders ile kaydeder (bkz. PurchaseOrdersService,
   * eskiden otomatik olusturan POST ucu buraya tasindi). */
  @Get(':id/purchase-order-draft')
  @RequiresPermission('purchase-orders', 'CREATE')
  getPurchaseOrderDraft(@Param('id') id: string): Promise<PurchaseOrderDraft> {
    return this.purchaseOrders.getDraftFromQuote(id);
  }
}
