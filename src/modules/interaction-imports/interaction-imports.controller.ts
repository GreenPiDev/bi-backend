import {
  Body,
  Controller,
  HttpStatus,
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
import {
  CurrentUser,
  type RequestUser,
} from '../../core/decorators/current-user.decorator';
import { RequiresPermission } from '../../core/decorators/requires-permission.decorator';
import { AppException } from '../../core/errors/app.exception';
import { MAX_UPLOAD_SIZE_BYTES } from '../datasources/datasources.constants';
import { detectDataSourceType } from '../datasources/file-signature';
import {
  HeaderRowIndexSchema,
  InteractionImportAttributeColumnsSchema,
  InteractionImportMappingSchema,
} from './dto/interaction-import.dto';
import type {
  InteractionImportPreview,
  InteractionImportRawPreview,
  InteractionImportResult,
} from './interaction-imports.service';
import { InteractionImportsService } from './interaction-imports.service';

const UPLOAD_INTERCEPTOR = FileInterceptor('file', {
  limits: { fileSize: MAX_UPLOAD_SIZE_BYTES },
  storage: diskStorage({
    destination: (_req, _file, cb) => cb(null, os.tmpdir()),
    filename: (_req, file, cb) =>
      cb(
        null,
        `pilens-interaction-import-${randomUUID()}${path.extname(file.originalname)}`,
      ),
  }),
});

function parseMapping(raw: string | undefined): Record<string, string> {
  if (!raw) {
    throw new AppException(
      'VALIDATION_ERROR',
      "'mapping' alani zorunludur.",
      HttpStatus.BAD_REQUEST,
    );
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new AppException(
      'VALIDATION_ERROR',
      "'mapping' alani gecerli JSON olmalidir.",
      HttpStatus.BAD_REQUEST,
    );
  }
  const result = InteractionImportMappingSchema.safeParse(json);
  if (!result.success) {
    throw new AppException(
      'VALIDATION_ERROR',
      "'mapping' alani gecersiz.",
      HttpStatus.BAD_REQUEST,
    );
  }
  return result.data;
}

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

@Controller('interaction-imports')
export class InteractionImportsController {
  constructor(private readonly interactionImports: InteractionImportsService) {}

  /**
   * headerRowIndex verilmemisse ham satirlar doner (kullanici baslik satirini secer);
   * verilmisse o satir baslik kabul edilip eslesme onizlemesi doner - accounts/
   * product-imports ile ayni desen (bkz. docs/VARSAYIMLAR.md V40).
   */
  @Post('preview')
  @RequiresPermission('interactions', 'IMPORT')
  @UseInterceptors(UPLOAD_INTERCEPTOR)
  async preview(
    @UploadedFile() file: Express.Multer.File,
    @Body('headerRowIndex') headerRowIndexRaw: string | undefined,
  ): Promise<InteractionImportRawPreview | InteractionImportPreview> {
    return this.withUploadedFile(file, async (filePath, type) => {
      if (headerRowIndexRaw === undefined || headerRowIndexRaw === '') {
        return this.interactionImports.previewRaw(filePath, type);
      }
      const headerRowIndex = HeaderRowIndexSchema.parse(headerRowIndexRaw);
      return this.interactionImports.preview(filePath, type, headerRowIndex);
    });
  }

  @Post()
  @RequiresPermission('interactions', 'IMPORT')
  @UseInterceptors(UPLOAD_INTERCEPTOR)
  async importInteractions(
    @CurrentUser() user: RequestUser,
    @UploadedFile() file: Express.Multer.File,
    @Body('headerRowIndex') headerRowIndexRaw: string | undefined,
    @Body('mapping') mappingRaw: string | undefined,
    @Body('attributeColumns') attributeColumnsRaw: string | undefined,
  ): Promise<InteractionImportResult> {
    const headerRowIndex = HeaderRowIndexSchema.parse(headerRowIndexRaw ?? '0');
    const mapping = parseMapping(mappingRaw);
    const attributeColumns = attributeColumnsRaw
      ? parseJsonBody(
          attributeColumnsRaw,
          InteractionImportAttributeColumnsSchema,
          'attributeColumns',
        )
      : [];
    return this.withUploadedFile(file, (filePath, type) =>
      this.interactionImports.importInteractions(
        user.id,
        filePath,
        type,
        headerRowIndex,
        mapping,
        attributeColumns,
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
