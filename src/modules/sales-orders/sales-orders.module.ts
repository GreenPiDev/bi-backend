import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { POST_SALE_SURVEY_QUEUE } from '../../jobs/post-sale-survey-queue.constants';
import { PostSaleCasesModule } from '../post-sale-cases/post-sale-cases.module';
import { SalesOrdersCacheService } from './sales-orders-cache.service';
import { SalesOrdersController } from './sales-orders.controller';
import { SalesOrdersService } from './sales-orders.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: POST_SALE_SURVEY_QUEUE }),
    PostSaleCasesModule,
  ],
  controllers: [SalesOrdersController],
  providers: [SalesOrdersService, SalesOrdersCacheService],
  exports: [SalesOrdersService, SalesOrdersCacheService],
})
export class SalesOrdersModule {}
