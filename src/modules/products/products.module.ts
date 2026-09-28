import { Module } from '@nestjs/common';
import { ProductPriceHistoryCacheService } from './product-price-history-cache.service';
import { ProductsCacheService } from './products-cache.service';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  controllers: [ProductsController],
  providers: [
    ProductsService,
    ProductsCacheService,
    ProductPriceHistoryCacheService,
  ],
  exports: [
    ProductsService,
    ProductsCacheService,
    ProductPriceHistoryCacheService,
  ],
})
export class ProductsModule {}
