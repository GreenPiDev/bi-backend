import {
  Controller,
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
import { AppException } from '../../core/errors/app.exception';
import { ExportsService } from './exports.service';

@Controller('exports')
export class ExportsController {
  constructor(private readonly exports: ExportsService) {}

  @Post('widget/:id')
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
}
