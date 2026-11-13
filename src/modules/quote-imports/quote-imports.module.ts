import { Module } from '@nestjs/common';
import { DatasourcesModule } from '../datasources/datasources.module';
import { ProductListsModule } from '../product-lists/product-lists.module';
import { ProductsModule } from '../products/products.module';
import { QuotesModule } from '../quotes/quotes.module';
import { QuoteImportsController } from './quote-imports.controller';
import { QuoteImportsService } from './quote-imports.service';
import { QuoteItemImportsService } from './quote-item-imports.service';

@Module({
  imports: [
    DatasourcesModule,
    QuotesModule,
    ProductListsModule,
    ProductsModule,
  ],
  controllers: [QuoteImportsController],
  providers: [QuoteImportsService, QuoteItemImportsService],
})
export class QuoteImportsModule {}
