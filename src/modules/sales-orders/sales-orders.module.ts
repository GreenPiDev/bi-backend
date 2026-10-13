import { Module } from '@nestjs/common';
import { SalesOrdersCacheService } from './sales-orders-cache.service';
import { SalesOrdersController } from './sales-orders.controller';
import { SalesOrdersService } from './sales-orders.service';

@Module({
  controllers: [SalesOrdersController],
  providers: [SalesOrdersService, SalesOrdersCacheService],
  exports: [SalesOrdersService, SalesOrdersCacheService],
})
export class SalesOrdersModule {}
