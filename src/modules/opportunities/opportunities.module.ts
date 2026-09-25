import { Module } from '@nestjs/common';
import { CalendarEventsModule } from '../calendar-events/calendar-events.module';
import { OpportunitiesCacheService } from './opportunities-cache.service';
import { OpportunitiesController } from './opportunities.controller';
import { OpportunitiesService } from './opportunities.service';

@Module({
  imports: [CalendarEventsModule],
  controllers: [OpportunitiesController],
  providers: [OpportunitiesService, OpportunitiesCacheService],
  exports: [OpportunitiesService, OpportunitiesCacheService],
})
export class OpportunitiesModule {}
