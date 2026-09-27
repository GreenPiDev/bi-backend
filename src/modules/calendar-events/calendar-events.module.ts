import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { CalendarEventsCacheService } from './calendar-events-cache.service';
import { CalendarEventsController } from './calendar-events.controller';
import { CalendarEventsService } from './calendar-events.service';

@Module({
  imports: [NotificationsModule],
  controllers: [CalendarEventsController],
  providers: [CalendarEventsService, CalendarEventsCacheService],
  exports: [CalendarEventsService, CalendarEventsCacheService],
})
export class CalendarEventsModule {}
