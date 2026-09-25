import { Module } from '@nestjs/common';
import { IbanOptionsController } from './iban-options.controller';
import { IbanOptionsService } from './iban-options.service';

@Module({
  controllers: [IbanOptionsController],
  providers: [IbanOptionsService],
  exports: [IbanOptionsService],
})
export class IbanOptionsModule {}
