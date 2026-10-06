import { Module } from '@nestjs/common';
import { DrawingExportService } from './drawing-export.service';
import { DrawingPdfService } from './drawing-pdf.service';
import { DrawingsController } from './drawings.controller';
import { DrawingsService } from './drawings.service';

@Module({
  controllers: [DrawingsController],
  providers: [DrawingsService, DrawingExportService, DrawingPdfService],
  exports: [DrawingsService],
})
export class DrawingsModule {}
