import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import * as os from 'node:os';
import * as path from 'node:path';
import { diskStorage } from 'multer';
import {
  CurrentUser,
  type RequestUser,
} from '../../core/decorators/current-user.decorator';
import { ModulePage } from '../../core/decorators/module-page.decorator';
import { RequiresPermission } from '../../core/decorators/requires-permission.decorator';
import { AppException } from '../../core/errors/app.exception';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import { MAX_UPLOAD_SIZE_BYTES } from './datasources.constants';
import {
  DatasourcesService,
  type DataSourceRawPreview,
  type DataSourceStatusView,
} from './datasources.service';
import {
  UploadDatasourceSchema,
  type UploadDatasourceDto,
} from './dto/upload-datasource.dto';

const UPLOAD_INTERCEPTOR = FileInterceptor('file', {
  limits: { fileSize: MAX_UPLOAD_SIZE_BYTES },
  storage: diskStorage({
    destination: (_req, _file, cb) => cb(null, os.tmpdir()),
    filename: (_req, file, cb) =>
      cb(
        null,
        `pilens-upload-${randomUUID()}${path.extname(file.originalname)}`,
      ),
  }),
});

@ModulePage('datasets')
@Controller('datasources')
export class DatasourcesController {
  constructor(private readonly datasources: DatasourcesService) {}

  /**
   * Kullanicinin baslik satirini goze bakarak secmesi icin: dosyanin ilk satirlarini
   * ham (satir 1 = baslik varsayimiyla) doner - modules/product-imports'taki previewRaw
   * ile ayni desen (bkz. plan: docs/VARSAYIMLAR.md).
   */
  @Post('preview-raw')
  @RequiresPermission('datasets', 'CREATE')
  @UseInterceptors(UPLOAD_INTERCEPTOR)
  async previewRaw(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<DataSourceRawPreview> {
    if (!file) {
      throw new AppException(
        'FILE_REQUIRED',
        'Dosya yuklenmedi.',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.datasources.previewRaw(file);
  }

  @Post('upload')
  @RequiresPermission('datasets', 'CREATE')
  @UseInterceptors(UPLOAD_INTERCEPTOR)
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body(new ZodValidationPipe(UploadDatasourceSchema))
    dto: UploadDatasourceDto,
    @CurrentUser() user: RequestUser,
  ): Promise<{ id: string }> {
    if (!file) {
      throw new AppException(
        'FILE_REQUIRED',
        'Dosya yuklenmedi.',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.datasources.upload(
      file,
      dto.name,
      dto.headerRowIndex,
      user.tenantId,
      user.id,
    );
  }

  @Get(':id/status')
  @RequiresPermission('datasets', 'VIEW')
  getStatus(@Param('id') id: string): Promise<DataSourceStatusView> {
    return this.datasources.getStatus(id);
  }
}
