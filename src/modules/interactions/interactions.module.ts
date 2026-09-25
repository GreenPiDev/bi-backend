import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { CalendarEventsModule } from '../calendar-events/calendar-events.module';
import { OpportunitiesModule } from '../opportunities/opportunities.module';
import { InteractionsCacheService } from './interactions-cache.service';
import { InteractionsController } from './interactions.controller';
import { InteractionsService } from './interactions.service';

@Module({
  imports: [AccountsModule, CalendarEventsModule, OpportunitiesModule],
  controllers: [InteractionsController],
  providers: [InteractionsService, InteractionsCacheService],
  exports: [InteractionsService, InteractionsCacheService],
})
export class InteractionsModule {}
