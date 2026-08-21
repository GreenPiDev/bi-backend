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
import { Roles } from '../../core/decorators/roles.decorator';
import { AppException } from '../../core/errors/app.exception';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import { MAX_UPLOAD_SIZE_BYTES } from './datasources.constants';
import {
  DatasourcesService,
  type DataSourceStatusView,
} from './datasources.service';
import {
  UploadDatasourceSchema,
  type UploadDatasourceDto,
} from './dto/upload-datasource.dto';

@Controller('datasources')
export class DatasourcesController {
  constructor(private readonly datasources: DatasourcesService) {}

  @Post('upload')
  @Roles('OWNER', 'ADMIN', 'EDITOR')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_UPLOAD_SIZE_BYTES },
      storage: diskStorage({
        destination: (_req, _file, cb) => cb(null, os.tmpdir()),
        filename: (_req, file, cb) =>
          cb(
            null,
            `pusula-upload-${randomUUID()}${path.extname(file.originalname)}`,
          ),
      }),
    }),
  )
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
    return this.datasources.upload(file, dto.name, user.tenantId, user.id);
  }

  @Get(':id/status')
  getStatus(@Param('id') id: string): Promise<DataSourceStatusView> {
    return this.datasources.getStatus(id);
  }
}
