import { Module } from '@nestjs/common';
import { IbanOptionGroupsController } from './iban-option-groups.controller';
import { IbanOptionGroupsService } from './iban-option-groups.service';

@Module({
  controllers: [IbanOptionGroupsController],
  providers: [IbanOptionGroupsService],
  exports: [IbanOptionGroupsService],
})
export class IbanOptionGroupsModule {}
