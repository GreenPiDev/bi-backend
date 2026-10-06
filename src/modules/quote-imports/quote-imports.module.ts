import { Module } from '@nestjs/common';
import { DatasourcesModule } from '../datasources/datasources.module';
import { QuotesModule } from '../quotes/quotes.module';
import { QuoteImportsController } from './quote-imports.controller';
import { QuoteImportsService } from './quote-imports.service';

@Module({
  imports: [DatasourcesModule, QuotesModule],
  controllers: [QuoteImportsController],
  providers: [QuoteImportsService],
})
export class QuoteImportsModule {}
