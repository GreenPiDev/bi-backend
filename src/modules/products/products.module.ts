import { Module } from '@nestjs/common';
import { ProductsCacheService } from './products-cache.service';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  controllers: [ProductsController],
  providers: [ProductsService, ProductsCacheService],
  exports: [ProductsService, ProductsCacheService],
})
export class ProductsModule {}
