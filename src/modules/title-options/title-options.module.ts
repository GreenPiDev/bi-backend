import { Module } from '@nestjs/common';
import { TitleOptionsController } from './title-options.controller';
import { TitleOptionsService } from './title-options.service';

@Module({
  controllers: [TitleOptionsController],
  providers: [TitleOptionsService],
  exports: [TitleOptionsService],
})
export class TitleOptionsModule {}
