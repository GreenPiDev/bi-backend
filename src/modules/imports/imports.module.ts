import { Module } from '@nestjs/common';
import { DatasourcesModule } from '../datasources/datasources.module';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';

@Module({
  imports: [DatasourcesModule],
  controllers: [ImportsController],
  providers: [ImportsService],
})
export class ImportsModule {}
