import { Module } from '@nestjs/common';
import { QuoteRejectionReasonOptionsController } from './quote-rejection-reason-options.controller';
import { QuoteRejectionReasonOptionsService } from './quote-rejection-reason-options.service';

@Module({
  controllers: [QuoteRejectionReasonOptionsController],
  providers: [QuoteRejectionReasonOptionsService],
  exports: [QuoteRejectionReasonOptionsService],
})
export class QuoteRejectionReasonOptionsModule {}
