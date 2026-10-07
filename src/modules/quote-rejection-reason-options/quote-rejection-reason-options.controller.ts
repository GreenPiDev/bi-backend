import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import type { QuoteRejectionReasonOption } from '@prisma/client';
import { RequiresModule } from '../../core/decorators/requires-module.decorator';
import { RequiresPermission } from '../../core/decorators/requires-permission.decorator';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import {
  CreateQuoteRejectionReasonOptionSchema,
  UpdateQuoteRejectionReasonOptionSchema,
  type CreateQuoteRejectionReasonOptionDto,
  type UpdateQuoteRejectionReasonOptionDto,
} from './dto/quote-rejection-reason-option.dto';
import { QuoteRejectionReasonOptionsService } from './quote-rejection-reason-options.service';

@RequiresModule('crm')
@Controller('quote-rejection-reason-options')
export class QuoteRejectionReasonOptionsController {
  constructor(
    private readonly quoteRejectionReasonOptions: QuoteRejectionReasonOptionsService,
  ) {}

  @Get()
  list(): Promise<QuoteRejectionReasonOption[]> {
    return this.quoteRejectionReasonOptions.list();
  }

  @Post()
  @RequiresPermission('settings', 'UPDATE')
  create(
    @Body(new ZodValidationPipe(CreateQuoteRejectionReasonOptionSchema))
    dto: CreateQuoteRejectionReasonOptionDto,
  ): Promise<QuoteRejectionReasonOption> {
    return this.quoteRejectionReasonOptions.create(dto);
  }

  @Patch(':id')
  @RequiresPermission('settings', 'UPDATE')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateQuoteRejectionReasonOptionSchema))
    dto: UpdateQuoteRejectionReasonOptionDto,
  ): Promise<QuoteRejectionReasonOption> {
    return this.quoteRejectionReasonOptions.update(id, dto);
  }

  @Delete(':id')
  @RequiresPermission('settings', 'UPDATE')
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.quoteRejectionReasonOptions.remove(id);
  }
}
