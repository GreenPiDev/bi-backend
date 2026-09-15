import { Module } from '@nestjs/common';
import { ProductListsController } from './product-lists.controller';
import { ProductListsService } from './product-lists.service';

@Module({
  controllers: [ProductListsController],
  providers: [ProductListsService],
  exports: [ProductListsService],
})
export class ProductListsModule {}
