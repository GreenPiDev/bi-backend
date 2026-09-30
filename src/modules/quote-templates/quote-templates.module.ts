import { Module } from '@nestjs/common';
import { QuoteTemplatesController } from './quote-templates.controller';
import { QuoteTemplatesService } from './quote-templates.service';

@Module({
  controllers: [QuoteTemplatesController],
  providers: [QuoteTemplatesService],
  exports: [QuoteTemplatesService],
})
export class QuoteTemplatesModule {}
