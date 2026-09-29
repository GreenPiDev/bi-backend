import { Module } from '@nestjs/common';
import { CalendarSharesController } from './calendar-shares.controller';
import { CalendarSharesService } from './calendar-shares.service';

@Module({
  controllers: [CalendarSharesController],
  providers: [CalendarSharesService],
  exports: [CalendarSharesService],
})
export class CalendarSharesModule {}
