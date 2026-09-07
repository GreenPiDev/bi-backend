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
  CreateQuoteSchema,
  QuoteQuerySchema,
  UpdateQuoteSchema,
  type CreateQuoteDto,
  type QuoteQueryDto,
  type UpdateQuoteDto,
} from './dto/quote.dto';
import { QuotesService, type QuoteWithDetails } from './quotes.service';

@ModulePage('quotes')
@Controller('quotes')
export class QuotesController {
  constructor(private readonly quotes: QuotesService) {}

  @Get()
  @RequiresPermission('quotes', 'VIEW')
  list(
    @Query(new ZodValidationPipe(QuoteQuerySchema)) query: QuoteQueryDto,
  ): Promise<PagedResult<QuoteWithDetails>> {
    return this.quotes.list(query);
  }

  @Get(':id')
  @RequiresPermission('quotes', 'VIEW')
  getById(@Param('id') id: string): Promise<QuoteWithDetails> {
    return this.quotes.getById(id);
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
  ): Promise<QuoteWithDetails> {
    return this.quotes.update(id, dto);
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
}
