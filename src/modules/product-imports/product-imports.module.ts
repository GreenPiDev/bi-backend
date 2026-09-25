import { Module } from '@nestjs/common';
import { DatasourcesModule } from '../datasources/datasources.module';
import { ProductsModule } from '../products/products.module';
import { ProductImportsController } from './product-imports.controller';
import { ProductImportsService } from './product-imports.service';

@Module({
  imports: [DatasourcesModule, ProductsModule],
  controllers: [ProductImportsController],
  providers: [ProductImportsService],
})
export class ProductImportsModule {}
