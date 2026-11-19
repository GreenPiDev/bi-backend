import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Public } from '../../core/decorators/public.decorator';
import {
  PublicSharesService,
  type PublicShareView,
} from './public-shares.service';
import { ShareThrottlerGuard } from './share-throttler.guard';

function contentDisposition(
  kind: 'inline' | 'attachment',
  fileName: string,
): string {
  const sanitized = fileName.replace(/[\r\n"]/g, '');
  const asciiFallback = sanitized.replace(/[^\x20-\x7E]/g, '_');
  return `${kind}; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(sanitized)}`;
}

/** Kimlik dogrulamasiz paylasim linki uclari (bkz. docs/VARSAYIMLAR.md V87) -
 * @ModulePage/@RequiresPermission KULLANILMAZ (public-surveys ile ayni). */
@Controller('public/shares')
export class PublicSharesController {
  constructor(private readonly publicShares: PublicSharesService) {}

  @Public()
  @Get(':token')
  @UseGuards(ShareThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  getByToken(@Param('token') token: string): Promise<PublicShareView> {
    return this.publicShares.getByToken(token);
  }

  /** Dogrudan tarayici navigasyonuyla acilir (yeni sekme / indirme) - bu yuzden
   * GET. `download=1` ise `attachment`, aksi halde tarayicinin PDF
   * goruntuleyicisinde `inline` acilir. */
  @Public()
  @Get(':token/file')
  @UseGuards(ShareThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async getFile(
    @Param('token') token: string,
    @Query('download') download: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const { file, fileName, contentType } =
      await this.publicShares.openFile(token);
    res.setHeader('Content-Type', contentType);
    if (file.contentLength !== undefined) {
      res.setHeader('Content-Length', String(file.contentLength));
    }
    res.setHeader(
      'Content-Disposition',
      contentDisposition(download === '1' ? 'attachment' : 'inline', fileName),
    );
    // Link iptal edilince/suresi dolunca ara bellekte kalmamali.
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    file.body.pipe(res);
  }
}
