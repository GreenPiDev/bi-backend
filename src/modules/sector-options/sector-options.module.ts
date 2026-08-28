import { Module } from '@nestjs/common';
import { SectorOptionsController } from './sector-options.controller';
import { SectorOptionsService } from './sector-options.service';

@Module({
  controllers: [SectorOptionsController],
  providers: [SectorOptionsService],
  exports: [SectorOptionsService],
})
export class SectorOptionsModule {}
