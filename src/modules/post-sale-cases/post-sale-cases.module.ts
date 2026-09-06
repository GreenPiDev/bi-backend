import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { POST_SALE_SURVEY_QUEUE } from '../../jobs/post-sale-survey-queue.constants';
import { PostSaleCasesController } from './post-sale-cases.controller';
import { PostSaleCasesService } from './post-sale-cases.service';

@Module({
  imports: [BullModule.registerQueue({ name: POST_SALE_SURVEY_QUEUE })],
  controllers: [PostSaleCasesController],
  providers: [PostSaleCasesService],
  exports: [PostSaleCasesService],
})
export class PostSaleCasesModule {}
