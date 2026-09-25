import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import type { ProductCategoryOption } from '@prisma/client';
import { RequiresModule } from '../../core/decorators/requires-module.decorator';
import { RequiresPermission } from '../../core/decorators/requires-permission.decorator';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import {
  CreateProductCategorySchema,
  UpdateProductCategorySchema,
  type CreateProductCategoryDto,
  type UpdateProductCategoryDto,
} from './dto/product-category.dto';
import { ProductCategoriesService } from './product-categories.service';

@RequiresModule('crm')
@Controller('product-categories')
export class ProductCategoriesController {
  constructor(private readonly productCategories: ProductCategoriesService) {}

  @Get()
  list(): Promise<ProductCategoryOption[]> {
    return this.productCategories.list();
  }

  @Post()
  @RequiresPermission('settings', 'UPDATE')
  create(
    @Body(new ZodValidationPipe(CreateProductCategorySchema))
    dto: CreateProductCategoryDto,
  ): Promise<ProductCategoryOption> {
    return this.productCategories.create(dto);
  }

  @Patch(':id')
  @RequiresPermission('settings', 'UPDATE')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateProductCategorySchema))
    dto: UpdateProductCategoryDto,
  ): Promise<ProductCategoryOption> {
    return this.productCategories.update(id, dto);
  }

  @Delete(':id')
  @RequiresPermission('settings', 'UPDATE')
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.productCategories.remove(id);
  }
}
