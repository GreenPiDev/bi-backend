import { Module } from '@nestjs/common';
import { BrandOptionsController } from './brand-options.controller';
import { BrandOptionsService } from './brand-options.service';

@Module({
  controllers: [BrandOptionsController],
  providers: [BrandOptionsService],
  exports: [BrandOptionsService],
})
export class BrandOptionsModule {}
