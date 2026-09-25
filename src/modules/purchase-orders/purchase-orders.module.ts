import { Module } from '@nestjs/common';
import { PurchaseOrdersCacheService } from './purchase-orders-cache.service';
import { PurchaseOrdersController } from './purchase-orders.controller';
import { PurchaseOrdersService } from './purchase-orders.service';

@Module({
  controllers: [PurchaseOrdersController],
  providers: [PurchaseOrdersService, PurchaseOrdersCacheService],
  exports: [PurchaseOrdersService, PurchaseOrdersCacheService],
})
export class PurchaseOrdersModule {}
