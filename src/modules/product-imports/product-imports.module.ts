import { Module } from '@nestjs/common';
import { DatasourcesModule } from '../datasources/datasources.module';
import { ProductImportsController } from './product-imports.controller';
import { ProductImportsService } from './product-imports.service';

@Module({
  imports: [DatasourcesModule],
  controllers: [ProductImportsController],
  providers: [ProductImportsService],
})
export class ProductImportsModule {}
