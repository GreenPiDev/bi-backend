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
import type { ProductList } from '@prisma/client';
import { ModulePage } from '../../core/decorators/module-page.decorator';
import { RequiresPermission } from '../../core/decorators/requires-permission.decorator';
import type { PagedResult } from '../../core/dto/list-query.dto';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import {
  CreateProductListSchema,
  ProductListQuerySchema,
  UpdateProductListSchema,
  type CreateProductListDto,
  type ProductListQueryDto,
  type UpdateProductListDto,
} from './dto/product-list.dto';
import { ProductListsService } from './product-lists.service';

@ModulePage('product-lists')
@Controller('product-lists')
export class ProductListsController {
  constructor(private readonly productLists: ProductListsService) {}

  @Get()
  @RequiresPermission('product-lists', 'VIEW')
  list(
    @Query(new ZodValidationPipe(ProductListQuerySchema))
    query: ProductListQueryDto,
  ): Promise<PagedResult<ProductList>> {
    return this.productLists.list(query);
  }

  @Get(':id')
  @RequiresPermission('product-lists', 'VIEW')
  getById(@Param('id') id: string): Promise<ProductList> {
    return this.productLists.getById(id);
  }

  @Post()
  @RequiresPermission('product-lists', 'CREATE')
  create(
    @Body(new ZodValidationPipe(CreateProductListSchema))
    dto: CreateProductListDto,
  ): Promise<ProductList> {
    return this.productLists.create(dto);
  }

  @Patch(':id')
  @RequiresPermission('product-lists', 'UPDATE')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateProductListSchema))
    dto: UpdateProductListDto,
  ): Promise<ProductList> {
    return this.productLists.update(id, dto);
  }

  @Delete(':id')
  @RequiresPermission('product-lists', 'DELETE')
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.productLists.remove(id);
  }
}
