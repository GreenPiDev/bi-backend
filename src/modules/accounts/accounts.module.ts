import { Module } from '@nestjs/common';
import { AccountsCacheService } from './accounts-cache.service';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';

@Module({
  controllers: [AccountsController],
  providers: [AccountsService, AccountsCacheService],
  exports: [AccountsService, AccountsCacheService],
})
export class AccountsModule {}
