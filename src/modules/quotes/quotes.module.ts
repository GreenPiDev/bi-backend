import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { POST_SALE_SURVEY_QUEUE } from '../../jobs/post-sale-survey-queue.constants';
import { OpportunitiesModule } from '../opportunities/opportunities.module';
import { PostSaleCasesModule } from '../post-sale-cases/post-sale-cases.module';
import { PurchaseOrdersModule } from '../purchase-orders/purchase-orders.module';
import { QuotesCacheService } from './quotes-cache.service';
import { QuotesController } from './quotes.controller';
import { QuotesService } from './quotes.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: POST_SALE_SURVEY_QUEUE }),
    PurchaseOrdersModule,
    OpportunitiesModule,
    PostSaleCasesModule,
  ],
  controllers: [QuotesController],
  providers: [QuotesService, QuotesCacheService],
  exports: [QuotesService, QuotesCacheService],
})
export class QuotesModule {}
