import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { CacheController } from './cache.controller';

@Module({
  imports: [AccountsModule],
  controllers: [CacheController],
})
export class CacheModule {}
