import {
  Body,
  Controller,
  HttpStatus,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Drawing } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import * as fsPromises from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { diskStorage } from 'multer';
import { ModulePage } from '../../core/decorators/module-page.decorator';
import { RequiresPermission } from '../../core/decorators/requires-permission.decorator';
import { AppException } from '../../core/errors/app.exception';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import { MAX_UPLOAD_SIZE_BYTES } from '../datasources/datasources.constants';
import {
  DrawingImportCommitSchema,
  DrawingImportPreviewQuerySchema,
  type DrawingImportCommitDto,
  type DrawingImportPreviewQueryDto,
} from './dto/drawing-import.dto';
import type { DrawingImportPreviewResult } from './drawing-imports.service';
import { DrawingImportsService } from './drawing-imports.service';
import { assertPdfUpload } from './pdf-validation';

const UPLOAD_INTERCEPTOR = FileInterceptor('file', {
  limits: { fileSize: MAX_UPLOAD_SIZE_BYTES },
  storage: diskStorage({
    destination: (_req, _file, cb) => cb(null, os.tmpdir()),
    filename: (_req, file, cb) =>
      cb(
        null,
        `pilens-drawing-import-${randomUUID()}${path.extname(file.originalname)}`,
      ),
  }),
});

@ModulePage('drawings')
@Controller('drawing-imports')
export class DrawingImportsController {
  constructor(private readonly drawingImports: DrawingImportsService) {}

  @Post('preview')
  @RequiresPermission('drawings', 'CREATE')
  @UseInterceptors(UPLOAD_INTERCEPTOR)
  async preview(
    @UploadedFile() file: Express.Multer.File,
    @Body('quoteId') quoteIdRaw: string | undefined,
  ): Promise<DrawingImportPreviewResult> {
    if (!file) {
      throw new AppException(
        'FILE_REQUIRED',
        'Dosya yüklenmedi.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const { quoteId }: DrawingImportPreviewQueryDto =
      DrawingImportPreviewQuerySchema.parse({ quoteId: quoteIdRaw });
    try {
      const buffer = await fsPromises.readFile(file.path);
      assertPdfUpload(file.originalname, buffer);
      return await this.drawingImports.previewFromPdf(quoteId, buffer);
    } finally {
      await fsPromises.unlink(file.path).catch(() => undefined);
    }
  }

  @Post('commit')
  @RequiresPermission('drawings', 'CREATE')
  commit(
    @Body(new ZodValidationPipe(DrawingImportCommitSchema))
    dto: DrawingImportCommitDto,
  ): Promise<Drawing[]> {
    return this.drawingImports.commit(dto);
  }
}
