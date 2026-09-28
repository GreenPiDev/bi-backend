import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { CalendarEventsModule } from '../calendar-events/calendar-events.module';
import { InteractionsModule } from '../interactions/interactions.module';
import { MessagesModule } from '../messages/messages.module';
import { OpportunitiesModule } from '../opportunities/opportunities.module';
import { PostSaleCasesModule } from '../post-sale-cases/post-sale-cases.module';
import { ProductsModule } from '../products/products.module';
import { ProjectsModule } from '../projects/projects.module';
import { PurchaseOrdersModule } from '../purchase-orders/purchase-orders.module';
import { QuotesModule } from '../quotes/quotes.module';
import { CacheController } from './cache.controller';

@Module({
  imports: [
    AccountsModule,
    OpportunitiesModule,
    QuotesModule,
    ProjectsModule,
    PurchaseOrdersModule,
    PostSaleCasesModule,
    InteractionsModule,
    MessagesModule,
    ProductsModule,
    CalendarEventsModule,
  ],
  controllers: [CacheController],
})
export class CacheModule {}
