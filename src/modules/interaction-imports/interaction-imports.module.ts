import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { DatasourcesModule } from '../datasources/datasources.module';
import { InteractionsModule } from '../interactions/interactions.module';
import { InteractionTypeOptionsModule } from '../interaction-type-options/interaction-type-options.module';
import { InteractionImportsController } from './interaction-imports.controller';
import { InteractionImportsService } from './interaction-imports.service';

@Module({
  imports: [
    DatasourcesModule,
    AccountsModule,
    InteractionsModule,
    InteractionTypeOptionsModule,
  ],
  controllers: [InteractionImportsController],
  providers: [InteractionImportsService],
})
export class InteractionImportsModule {}
