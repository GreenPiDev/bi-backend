import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { randomUUID } from 'node:crypto';
import * as fsPromises from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { diskStorage } from 'multer';
import { RequiresModule } from '../../core/decorators/requires-module.decorator';
import { RequiresPermission } from '../../core/decorators/requires-permission.decorator';
import { AppException } from '../../core/errors/app.exception';
import { MAX_UPLOAD_SIZE_BYTES } from '../datasources/datasources.constants';
import { detectDataSourceType } from '../datasources/file-signature';
import type { ImportPreview, ImportResult } from './imports.service';
import { ImportsService } from './imports.service';
import { ImportMappingSchema } from './dto/import-mapping.dto';

const UPLOAD_INTERCEPTOR = FileInterceptor('file', {
  limits: { fileSize: MAX_UPLOAD_SIZE_BYTES },
  storage: diskStorage({
    destination: (_req, _file, cb) => cb(null, os.tmpdir()),
    filename: (_req, file, cb) =>
      cb(
        null,
        `pilens-import-${randomUUID()}${path.extname(file.originalname)}`,
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
  const result = ImportMappingSchema.safeParse(json);
  if (!result.success) {
    throw new AppException(
      'VALIDATION_ERROR',
      "'mapping' alani gecersiz.",
      HttpStatus.BAD_REQUEST,
    );
  }
  return result.data;
}

@RequiresModule('crm')
@Controller('imports')
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @Post('preview')
  @RequiresPermission('accounts', 'CREATE')
  @UseInterceptors(UPLOAD_INTERCEPTOR)
  async preview(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ImportPreview> {
    return this.withUploadedFile(file, (filePath, type) =>
      this.imports.preview(filePath, type),
    );
  }

  @Post('accounts')
  @RequiresPermission('accounts', 'CREATE')
  @UseInterceptors(UPLOAD_INTERCEPTOR)
  async importAccounts(
    @UploadedFile() file: Express.Multer.File,
    @Body('mapping') mappingRaw: string | undefined,
  ): Promise<ImportResult> {
    const mapping = parseMapping(mappingRaw);
    return this.withUploadedFile(file, (filePath, type) =>
      this.imports.importAccounts(filePath, type, mapping),
    );
  }

  @Post('contacts')
  @RequiresPermission('contacts', 'CREATE')
  @UseInterceptors(UPLOAD_INTERCEPTOR)
  async importContacts(
    @UploadedFile() file: Express.Multer.File,
    @Body('mapping') mappingRaw: string | undefined,
  ): Promise<ImportResult> {
    const mapping = parseMapping(mappingRaw);
    return this.withUploadedFile(file, (filePath, type) =>
      this.imports.importContacts(filePath, type, mapping),
    );
  }

  @Get('accounts/export')
  async exportAccounts(@Res() res: Response): Promise<void> {
    const buffer = await this.imports.exportAccounts();
    res
      .header(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      )
      .header('Content-Disposition', 'attachment; filename="firmalar.xlsx"')
      .send(buffer);
  }

  @Get('contacts/export')
  async exportContacts(@Res() res: Response): Promise<void> {
    const buffer = await this.imports.exportContacts();
    res
      .header(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      )
      .header('Content-Disposition', 'attachment; filename="kisiler.xlsx"')
      .send(buffer);
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
