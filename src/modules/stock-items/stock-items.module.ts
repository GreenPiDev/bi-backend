import { Module } from '@nestjs/common';
import { ProductsModule } from '../products/products.module';
import { StockItemsController } from './stock-items.controller';
import { StockItemsService } from './stock-items.service';

@Module({
  imports: [ProductsModule],
  controllers: [StockItemsController],
  providers: [StockItemsService],
  exports: [StockItemsService],
})
export class StockItemsModule {}
