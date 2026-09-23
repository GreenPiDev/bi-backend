import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { DatasourcesModule } from '../datasources/datasources.module';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';

@Module({
  imports: [DatasourcesModule, AccountsModule],
  controllers: [ImportsController],
  providers: [ImportsService],
})
export class ImportsModule {}
