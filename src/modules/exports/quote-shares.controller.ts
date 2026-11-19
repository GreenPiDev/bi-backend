import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import {
  CurrentUser,
  type RequestUser,
} from '../../core/decorators/current-user.decorator';
import { RequiresPermission } from '../../core/decorators/requires-permission.decorator';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import {
  CreateShareSchema,
  type CreateShareDto,
} from '../shares/dto/share.dto';
import { SharesService, type ShareView } from '../shares/shares.service';
import { ExportsService } from './exports.service';

/**
 * Teklif PDF'i icin paylasim linki uclari (bkz. docs/VARSAYIMLAR.md V87) - merkezi
 * SharesService'in ilk kullanicisi. Yetki teklif PDF export'uyla ayni
 * (`quotes:EXPORT`): PDF'i indirebilen kullanici onu disariyla da paylasabilir.
 * Teklif baska tenant'a aitse ExportsService.getById 404 doner (CLAUDE.md SS5).
 */
@Controller('shares/quotes/:quoteId')
export class QuoteSharesController {
  constructor(
    private readonly exports: ExportsService,
    private readonly shares: SharesService,
  ) {}

  @Post()
  @RequiresPermission('quotes', 'EXPORT')
  async create(
    @Param('quoteId') quoteId: string,
    @Body(new ZodValidationPipe(CreateShareSchema)) dto: CreateShareDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ShareView> {
    const { pdf, fileName, title } = await this.exports.buildQuoteShareFile(
      quoteId,
      user,
    );
    return this.shares.createFileShare({
      resourceType: 'QUOTE',
      resourceId: quoteId,
      title,
      file: {
        buffer: pdf,
        fileName: `${fileName}.pdf`,
        contentType: 'application/pdf',
      },
      expiresInDays: dto.expiresInDays,
    });
  }

  @Get()
  @RequiresPermission('quotes', 'EXPORT')
  async list(@Param('quoteId') quoteId: string): Promise<ShareView[]> {
    await this.exports.assertQuoteExists(quoteId);
    return this.shares.listForResource('QUOTE', quoteId);
  }

  @Delete(':shareId')
  @RequiresPermission('quotes', 'EXPORT')
  async revoke(
    @Param('quoteId') quoteId: string,
    @Param('shareId') shareId: string,
  ): Promise<ShareView> {
    await this.exports.assertQuoteExists(quoteId);
    return this.shares.revoke('QUOTE', quoteId, shareId);
  }
}
