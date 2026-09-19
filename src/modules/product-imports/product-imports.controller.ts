import {
  Body,
  Controller,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import * as fsPromises from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { diskStorage } from 'multer';
import { RequiresPermission } from '../../core/decorators/requires-permission.decorator';
import { AppException } from '../../core/errors/app.exception';
import { MAX_UPLOAD_SIZE_BYTES } from '../datasources/datasources.constants';
import { detectDataSourceType } from '../datasources/file-signature';
import type {
  ProductImportPreview,
  ProductImportRawPreview,
  ProductImportResult,
} from './product-imports.service';
import { ProductImportsService } from './product-imports.service';
import {
  HeaderRowIndexSchema,
  NumberFormatSchema,
  ProductImportAttributeColumnsSchema,
  ProductImportMappingSchema,
} from './dto/product-import.dto';

const UPLOAD_INTERCEPTOR = FileInterceptor('file', {
  limits: { fileSize: MAX_UPLOAD_SIZE_BYTES },
  storage: diskStorage({
    destination: (_req, _file, cb) => cb(null, os.tmpdir()),
    filename: (_req, file, cb) =>
      cb(
        null,
        `pilens-product-import-${randomUUID()}${path.extname(file.originalname)}`,
      ),
  }),
});

function parseJsonBody<T>(
  raw: string | undefined,
  schema: { safeParse: (v: unknown) => { success: boolean; data?: T } },
  fieldLabel: string,
): T {
  if (!raw) {
    throw new AppException(
      'VALIDATION_ERROR',
      `'${fieldLabel}' alani zorunludur.`,
      HttpStatus.BAD_REQUEST,
    );
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new AppException(
      'VALIDATION_ERROR',
      `'${fieldLabel}' alani gecerli JSON olmalidir.`,
      HttpStatus.BAD_REQUEST,
    );
  }
  const result = schema.safeParse(json);
  if (!result.success || result.data === undefined) {
    throw new AppException(
      'VALIDATION_ERROR',
      `'${fieldLabel}' alani gecersiz.`,
      HttpStatus.BAD_REQUEST,
    );
  }
  return result.data;
}

@Controller('product-imports')
export class ProductImportsController {
  constructor(private readonly productImports: ProductImportsService) {}

  /**
   * headerRowIndex verilmemisse ham satirlar doner (kullanici baslik satirini secer);
   * verilmisse o satir baslik kabul edilip eslesme onizlemesi doner.
   */
  @Post('preview')
  @RequiresPermission('products', 'IMPORT')
  @UseInterceptors(UPLOAD_INTERCEPTOR)
  async preview(
    @UploadedFile() file: Express.Multer.File,
    @Body('headerRowIndex') headerRowIndexRaw: string | undefined,
  ): Promise<ProductImportRawPreview | ProductImportPreview> {
    return this.withUploadedFile(file, async (filePath, type) => {
      if (headerRowIndexRaw === undefined || headerRowIndexRaw === '') {
        return this.productImports.previewRaw(filePath, type);
      }
      const headerRowIndex = HeaderRowIndexSchema.parse(headerRowIndexRaw);
      return this.productImports.preview(filePath, type, headerRowIndex);
    });
  }

  @Post(':productListId')
  @RequiresPermission('products', 'IMPORT')
  @UseInterceptors(UPLOAD_INTERCEPTOR)
  async importProducts(
    @Param('productListId', ParseUUIDPipe) productListId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('headerRowIndex') headerRowIndexRaw: string | undefined,
    @Body('mapping') mappingRaw: string | undefined,
    @Body('attributeColumns') attributeColumnsRaw: string | undefined,
    @Body('numberFormat') numberFormatRaw: string | undefined,
  ): Promise<ProductImportResult> {
    const headerRowIndex = HeaderRowIndexSchema.parse(headerRowIndexRaw ?? '0');
    const mapping = parseJsonBody(
      mappingRaw,
      ProductImportMappingSchema,
      'mapping',
    );
    const attributeColumns = attributeColumnsRaw
      ? parseJsonBody(
          attributeColumnsRaw,
          ProductImportAttributeColumnsSchema,
          'attributeColumns',
        )
      : [];
    const numberFormat = NumberFormatSchema.parse(numberFormatRaw ?? 'tr');

    return this.withUploadedFile(file, (filePath, type) =>
      this.productImports.importProducts(
        filePath,
        type,
        headerRowIndex,
        productListId,
        mapping,
        attributeColumns,
        numberFormat,
      ),
    );
  }

  private async withUploadedFile<T>(
    file: Express.Multer.File,
    handler: (
      filePath: string,
      type: Awaited<ReturnType<typeof detectDataSourceType>>,
    ) => Promise<T>,
  ): Promise<T> {
    if (!file) {
      throw new AppException(
        'FILE_REQUIRED',
        'Dosya yuklenmedi.',
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      const type = await detectDataSourceType(
        file.originalname,
        file.mimetype,
        file.path,
      );
      return await handler(file.path, type);
    } finally {
      await fsPromises.unlink(file.path).catch(() => undefined);
    }
  }
}
