import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { POST_SALE_SURVEY_QUEUE } from '../../jobs/post-sale-survey-queue.constants';
import { PurchaseOrdersModule } from '../purchase-orders/purchase-orders.module';
import { QuotesController } from './quotes.controller';
import { QuotesService } from './quotes.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: POST_SALE_SURVEY_QUEUE }),
    PurchaseOrdersModule,
  ],
  controllers: [QuotesController],
  providers: [QuotesService],
  exports: [QuotesService],
})
export class QuotesModule {}
