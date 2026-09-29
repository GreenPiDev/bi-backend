import { Module } from '@nestjs/common';
import { ReminderTypeOptionsController } from './reminder-type-options.controller';
import { ReminderTypeOptionsService } from './reminder-type-options.service';

@Module({
  controllers: [ReminderTypeOptionsController],
  providers: [ReminderTypeOptionsService],
  exports: [ReminderTypeOptionsService],
})
export class ReminderTypeOptionsModule {}
