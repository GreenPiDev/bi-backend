import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import * as fsPromises from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { diskStorage } from 'multer';
import { ModulePage } from '../../core/decorators/module-page.decorator';
import { RequiresPermission } from '../../core/decorators/requires-permission.decorator';
import type { PagedResult } from '../../core/dto/list-query.dto';
import { AppException } from '../../core/errors/app.exception';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import { detectDataSourceType } from '../datasources/file-signature';
import {
  SaveSpreadsheetChangesSchema,
  SpreadsheetNameSchema,
  SpreadsheetQuerySchema,
  UpdateSpreadsheetSchema,
  type SaveSpreadsheetChangesDto,
  type SpreadsheetQueryDto,
  type UpdateSpreadsheetDto,
} from './dto/spreadsheet.dto';
import { SpreadsheetChangesService } from './spreadsheet-changes.service';
import { MAX_SPREADSHEET_UPLOAD_BYTES } from './spreadsheets.constants';
import type {
  CompactCell,
  SaveSpreadsheetChangesResult,
  SpreadsheetDetailView,
  SpreadsheetSummaryView,
} from './spreadsheet.types';
import { SpreadsheetsService } from './spreadsheets.service';

const UPLOAD_INTERCEPTOR = FileInterceptor('file', {
  limits: { fileSize: MAX_SPREADSHEET_UPLOAD_BYTES },
  storage: diskStorage({
    destination: (_req, _file, cb) => cb(null, os.tmpdir()),
    filename: (_req, file, cb) =>
      cb(
        null,
        `pilens-spreadsheet-${randomUUID()}${path.extname(file.originalname)}`,
      ),
  }),
});

@ModulePage('spreadsheets')
@Controller('spreadsheets')
export class SpreadsheetsController {
  constructor(
    private readonly spreadsheets: SpreadsheetsService,
    private readonly changes: SpreadsheetChangesService,
  ) {}

  @Get()
  @RequiresPermission('spreadsheets', 'VIEW')
  list(
    @Query(new ZodValidationPipe(SpreadsheetQuerySchema))
    query: SpreadsheetQueryDto,
  ): Promise<PagedResult<SpreadsheetSummaryView>> {
    return this.spreadsheets.list(query);
  }

  @Get(':id')
  @RequiresPermission('spreadsheets', 'VIEW')
  getById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SpreadsheetDetailView> {
    return this.spreadsheets.getById(id);
  }

  @Get(':id/sheets/:sheetId/cells')
  @RequiresPermission('spreadsheets', 'VIEW')
  getCells(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('sheetId', ParseUUIDPipe) sheetId: string,
  ): Promise<CompactCell[]> {
    return this.spreadsheets.getCells(id, sheetId);
  }

  @Post()
  @RequiresPermission('spreadsheets', 'CREATE')
  @UseInterceptors(UPLOAD_INTERCEPTOR)
  async create(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('name') nameRaw: string | undefined,
  ): Promise<SpreadsheetDetailView> {
    if (!file) {
      throw new AppException(
        'FILE_REQUIRED',
        'Dosya yuklenmedi.',
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      const name = nameRaw?.trim()
        ? SpreadsheetNameSchema.parse(nameRaw)
        : undefined;
      // multer, originalname'i latin1 olarak cozer - Turkce karakterli dosya adlari icin
      // UTF-8'e geri cevrilir.
      const originalName = Buffer.from(file.originalname, 'latin1').toString(
        'utf8',
      );
      const type = await detectDataSourceType(
        originalName,
        file.mimetype,
        file.path,
      );
      return await this.spreadsheets.create(
        file.path,
        type,
        originalName,
        name,
      );
    } finally {
      await fsPromises.unlink(file.path).catch(() => undefined);
    }
  }

  @Patch(':id')
  @RequiresPermission('spreadsheets', 'UPDATE')
  rename(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateSpreadsheetSchema))
    dto: UpdateSpreadsheetDto,
  ): Promise<SpreadsheetDetailView> {
    return this.spreadsheets.rename(id, dto);
  }

  @Post(':id/sheets/:sheetId/changes')
  @RequiresPermission('spreadsheets', 'UPDATE')
  saveChanges(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('sheetId', ParseUUIDPipe) sheetId: string,
    @Body(new ZodValidationPipe(SaveSpreadsheetChangesSchema))
    dto: SaveSpreadsheetChangesDto,
  ): Promise<SaveSpreadsheetChangesResult> {
    return this.changes.save(id, sheetId, dto);
  }

  @Delete(':id')
  @RequiresPermission('spreadsheets', 'DELETE')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.spreadsheets.remove(id);
  }
}
