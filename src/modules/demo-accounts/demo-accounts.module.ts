import { Module } from '@nestjs/common';
import { DemoAccountsController } from './demo-accounts.controller';
import { DemoAccountsService } from './demo-accounts.service';

@Module({
  controllers: [DemoAccountsController],
  providers: [DemoAccountsService],
})
export class DemoAccountsModule {}
