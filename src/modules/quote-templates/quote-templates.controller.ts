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
import { ModulePage } from '../../core/decorators/module-page.decorator';
import {
  CurrentUser,
  type RequestUser,
} from '../../core/decorators/current-user.decorator';
import { RequiresPermission } from '../../core/decorators/requires-permission.decorator';
import { AppException } from '../../core/errors/app.exception';
import type { PagedResult } from '../../core/dto/list-query.dto';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import { MAX_LOGO_IMAGE_SIZE_BYTES } from '../tenants/logo-image-validation';
import {
  CreateQuoteTemplateSchema,
  QuoteTemplateQuerySchema,
  UpdateQuoteTemplateSchema,
  type CreateQuoteTemplateDto,
  type QuoteTemplateQueryDto,
  type UpdateQuoteTemplateDto,
} from './dto/quote-template.dto';
import {
  QuoteTemplatesService,
  type QuoteTemplateResponse,
} from './quote-templates.service';

function requireFile(file: Express.Multer.File): void {
  if (!file) {
    throw new AppException(
      'FILE_REQUIRED',
      'Resim yuklenmedi.',
      HttpStatus.BAD_REQUEST,
    );
  }
}

@ModulePage('quote-templates')
@Controller('quote-templates')
export class QuoteTemplatesController {
  constructor(private readonly quoteTemplates: QuoteTemplatesService) {}

  @Get()
  @RequiresPermission('quote-templates', 'VIEW')
  list(
    @Query(new ZodValidationPipe(QuoteTemplateQuerySchema))
    query: QuoteTemplateQueryDto,
  ): Promise<PagedResult<QuoteTemplateResponse>> {
    return this.quoteTemplates.list(query);
  }

  @Get(':id')
  @RequiresPermission('quote-templates', 'VIEW')
  getById(@Param('id') id: string): Promise<QuoteTemplateResponse> {
    return this.quoteTemplates.getById(id);
  }

  @Post()
  @RequiresPermission('quote-templates', 'CREATE')
  create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(CreateQuoteTemplateSchema))
    dto: CreateQuoteTemplateDto,
  ): Promise<QuoteTemplateResponse> {
    return this.quoteTemplates.create(user.id, dto);
  }

  @Patch(':id')
  @RequiresPermission('quote-templates', 'UPDATE')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateQuoteTemplateSchema))
    dto: UpdateQuoteTemplateDto,
  ): Promise<QuoteTemplateResponse> {
    return this.quoteTemplates.update(id, dto);
  }

  @Post(':id/set-default')
  @RequiresPermission('quote-templates', 'UPDATE')
  setDefault(@Param('id') id: string): Promise<QuoteTemplateResponse> {
    return this.quoteTemplates.setDefault(id);
  }

  @Delete(':id')
  @RequiresPermission('quote-templates', 'DELETE')
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.quoteTemplates.remove(id);
  }

  @Post(':id/logo')
  @RequiresPermission('quote-templates', 'UPDATE')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_LOGO_IMAGE_SIZE_BYTES },
    }),
  )
  uploadLogo(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<QuoteTemplateResponse> {
    requireFile(file);
    return this.quoteTemplates.uploadLogo(id, file);
  }

  @Delete(':id/logo')
  @RequiresPermission('quote-templates', 'UPDATE')
  removeLogo(@Param('id') id: string): Promise<QuoteTemplateResponse> {
    return this.quoteTemplates.removeLogo(id);
  }

  @Post(':id/cover-image')
  @RequiresPermission('quote-templates', 'UPDATE')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_LOGO_IMAGE_SIZE_BYTES },
    }),
  )
  uploadCoverImage(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<QuoteTemplateResponse> {
    requireFile(file);
    return this.quoteTemplates.uploadCoverImage(id, file);
  }

  @Delete(':id/cover-image')
  @RequiresPermission('quote-templates', 'UPDATE')
  removeCoverImage(@Param('id') id: string): Promise<QuoteTemplateResponse> {
    return this.quoteTemplates.removeCoverImage(id);
  }

  @Post(':id/closing-image')
  @RequiresPermission('quote-templates', 'UPDATE')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_LOGO_IMAGE_SIZE_BYTES },
    }),
  )
  uploadClosingImage(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<QuoteTemplateResponse> {
    requireFile(file);
    return this.quoteTemplates.uploadClosingImage(id, file);
  }

  @Delete(':id/closing-image')
  @RequiresPermission('quote-templates', 'UPDATE')
  removeClosingImage(@Param('id') id: string): Promise<QuoteTemplateResponse> {
    return this.quoteTemplates.removeClosingImage(id);
  }
}
