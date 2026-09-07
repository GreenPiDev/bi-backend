import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { Product } from '@prisma/client';
import { ModulePage } from '../../core/decorators/module-page.decorator';
import { RequiresPermission } from '../../core/decorators/requires-permission.decorator';
import type { PagedResult } from '../../core/dto/list-query.dto';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import {
  CreateProductSchema,
  ProductQuerySchema,
  UpdateProductSchema,
  type CreateProductDto,
  type ProductQueryDto,
  type UpdateProductDto,
} from './dto/product.dto';
import { ProductsService } from './products.service';

@ModulePage('products')
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @RequiresPermission('products', 'VIEW')
  list(
    @Query(new ZodValidationPipe(ProductQuerySchema)) query: ProductQueryDto,
  ): Promise<PagedResult<Product>> {
    return this.products.list(query);
  }

  @Get(':id')
  @RequiresPermission('products', 'VIEW')
  getById(@Param('id') id: string): Promise<Product> {
    return this.products.getById(id);
  }

  @Post()
  @RequiresPermission('products', 'CREATE')
  create(
    @Body(new ZodValidationPipe(CreateProductSchema)) dto: CreateProductDto,
  ): Promise<Product> {
    return this.products.create(dto);
  }

  @Patch(':id')
  @RequiresPermission('products', 'UPDATE')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateProductSchema)) dto: UpdateProductDto,
  ): Promise<Product> {
    return this.products.update(id, dto);
  }

  @Delete(':id')
  @RequiresPermission('products', 'DELETE')
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.products.remove(id);
  }
}
