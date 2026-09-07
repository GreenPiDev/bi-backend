import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  CurrentUser,
  type RequestUser,
} from '../../core/decorators/current-user.decorator';
import { ModulePage } from '../../core/decorators/module-page.decorator';
import { RequiresPermission } from '../../core/decorators/requires-permission.decorator';
import type { PagedResult } from '../../core/dto/list-query.dto';
import { AppException } from '../../core/errors/app.exception';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import {
  CreateProductSchema,
  ProductQuerySchema,
  UpdateProductSchema,
  type CreateProductDto,
  type ProductQueryDto,
  type UpdateProductDto,
} from './dto/product.dto';
import { MAX_PRODUCT_IMAGE_SIZE_BYTES } from './product-image-validation';
import { ProductsService, type ProductView } from './products.service';

@ModulePage('products')
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @RequiresPermission('products', 'VIEW')
  list(
    @Query(new ZodValidationPipe(ProductQuerySchema)) query: ProductQueryDto,
  ): Promise<PagedResult<ProductView>> {
    return this.products.list(query);
  }

  @Get(':id')
  @RequiresPermission('products', 'VIEW')
  getById(@Param('id') id: string): Promise<ProductView> {
    return this.products.getById(id);
  }

  @Post()
  @RequiresPermission('products', 'CREATE')
  create(
    @Body(new ZodValidationPipe(CreateProductSchema)) dto: CreateProductDto,
  ): Promise<ProductView> {
    return this.products.create(dto);
  }

  @Patch(':id')
  @RequiresPermission('products', 'UPDATE')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateProductSchema)) dto: UpdateProductDto,
  ): Promise<ProductView> {
    return this.products.update(id, dto);
  }

  @Delete(':id')
  @RequiresPermission('products', 'DELETE')
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.products.remove(id);
  }

  @Post(':id/image')
  @RequiresPermission('products', 'UPDATE')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_PRODUCT_IMAGE_SIZE_BYTES },
    }),
  )
  uploadImage(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: RequestUser,
  ): Promise<ProductView> {
    if (!file) {
      throw new AppException(
        'FILE_REQUIRED',
        'Resim yuklenmedi.',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.products.uploadImage(id, user.tenantId, file);
  }

  @Delete(':id/image')
  @RequiresPermission('products', 'UPDATE')
  removeImage(@Param('id') id: string): Promise<ProductView> {
    return this.products.removeImage(id);
  }
}
