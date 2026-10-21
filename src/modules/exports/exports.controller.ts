import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  CurrentUser,
  type RequestUser,
} from '../../core/decorators/current-user.decorator';
import { RequiresPermission } from '../../core/decorators/requires-permission.decorator';
import { AppException } from '../../core/errors/app.exception';
import { ExportsService } from './exports.service';

@Controller('exports')
export class ExportsController {
  constructor(private readonly exports: ExportsService) {}

  @Post('widget/:id')
  @RequiresPermission('dashboards', 'EXPORT')
  @HttpCode(HttpStatus.OK)
  async exportWidget(
    @Param('id') id: string,
    @Query('format') format: string | undefined,
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ): Promise<void> {
    if (format !== 'csv') {
      throw new AppException(
        'UNSUPPORTED_FORMAT',
        'Bu widget disa aktarma formati desteklenmiyor. PNG icin grafik uzerindeki "PNG indir" secenegini kullanin.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const csv = await this.exports.exportWidgetCsv(id, user.tenantId);
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="widget-${id}.csv"`,
    });
    res.send(`﻿${csv}`);
  }

  @Post('dashboard/:id/pdf')
  @RequiresPermission('dashboards', 'EXPORT')
  @HttpCode(HttpStatus.OK)
  async exportDashboardPdf(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ): Promise<void> {
    const pdf = await this.exports.exportDashboardPdf(id, user);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="dashboard-${id}.pdf"`,
    });
    res.send(pdf);
  }

  // GET (POST degil): bu uc, dogrudan tarayici sekme navigasyonuyla acilir
  // (bkz. bi-frontend/src/lib/download.ts) - blob: URL'ye fetch'leyip sonra
  // tabHandle'a yazma deseni KASITLI OLARAK birakildi, cunku Chrome'un PDF
  // goruntuleyicisi blob: URL'lerde "kaydet" tiklaninca dosya adini PDF'in
  // Info/Title metadata'sindan DEGIL, blob'un kendi rastgele UUID'sinden
  // aliyor (denendi, calismadi). Gercek bir HTTP kaynagi olarak servis
  // edilince Content-Disposition'daki filename Chrome tarafindan dogru
  // kullaniliyor. `inline` (attachment degil): sekmede goruntulensin, "kaydet"
  // kullaniciya birakilsin.
  @Get('quote/:id/pdf')
  @RequiresPermission('quotes', 'EXPORT')
  async exportQuotePdf(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ): Promise<void> {
    const [pdf, fileName] = await Promise.all([
      this.exports.exportQuotePdf(id, user),
      this.exports.getQuotePdfFileName(id),
    ]);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${fileName}.pdf"`,
    });
    res.send(pdf);
  }

  @Get('quote/:id/cost-pdf')
  @RequiresPermission('quotes', 'EXPORT')
  async exportQuoteCostPdf(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ): Promise<void> {
    const [pdf, fileName] = await Promise.all([
      this.exports.exportQuoteCostPdf(id, user),
      this.exports.getQuotePdfFileName(id),
    ]);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${fileName}-maliyet.pdf"`,
    });
    res.send(pdf);
  }

  @Get('quote/:id/charts-pdf')
  @RequiresPermission('quotes', 'EXPORT')
  async exportQuoteChartsPdf(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ): Promise<void> {
    const [pdf, fileName] = await Promise.all([
      this.exports.exportQuoteChartsPdf(id, user),
      this.exports.getQuotePdfFileName(id),
    ]);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${fileName}-grafikler.pdf"`,
    });
    res.send(pdf);
  }

  @Post('reports/pdf')
  @RequiresPermission('reports', 'EXPORT')
  @HttpCode(HttpStatus.OK)
  async exportReportsPdf(
    @Query('tab') tab: string | undefined,
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ): Promise<void> {
    if (!tab) {
      throw new AppException(
        'UNKNOWN_REPORT_TAB',
        'Bilinmeyen rapor sekmesi.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const pdf = await this.exports.exportReportsPdf(tab, user);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="raporlar-${tab}.pdf"`,
    });
    res.send(pdf);
  }
}
