import { Module } from '@nestjs/common';
import { UnitOptionsController } from './unit-options.controller';
import { UnitOptionsService } from './unit-options.service';

@Module({
  controllers: [UnitOptionsController],
  providers: [UnitOptionsService],
  exports: [UnitOptionsService],
})
export class UnitOptionsModule {}
