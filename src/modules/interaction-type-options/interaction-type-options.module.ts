import { Module } from '@nestjs/common';
import { InteractionTypeOptionsController } from './interaction-type-options.controller';
import { InteractionTypeOptionsService } from './interaction-type-options.service';

@Module({
  controllers: [InteractionTypeOptionsController],
  providers: [InteractionTypeOptionsService],
  exports: [InteractionTypeOptionsService],
})
export class InteractionTypeOptionsModule {}
