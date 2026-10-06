import { Global, Module } from '@nestjs/common';
import { ListPdfService } from './list-pdf.service';

@Global()
@Module({
  providers: [ListPdfService],
  exports: [ListPdfService],
})
export class PdfModule {}
