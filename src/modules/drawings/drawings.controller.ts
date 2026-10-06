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
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import type { Drawing } from '@prisma/client';
import {
  CurrentUser,
  type RequestUser,
} from '../../core/decorators/current-user.decorator';
import { AppException } from '../../core/errors/app.exception';
import { ModulePage } from '../../core/decorators/module-page.decorator';
import { RequiresPermission } from '../../core/decorators/requires-permission.decorator';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import { FileUrlService } from '../../core/storage/file-url.service';
import { DrawingExportService } from './drawing-export.service';
import { DRAWING_VIEW_KEYS, type DrawingViewKey } from './engine/types';
import {
  DrawingPreviewRequestSchema,
  type DrawingPreviewRequestDto,
} from './dto/drawing-preview.dto';
import {
  CreateDrawingSchema,
  DrawingQuerySchema,
  UpdateDrawingSchema,
  type CreateDrawingDto,
  type DrawingQueryDto,
  type UpdateDrawingDto,
} from './dto/drawing.dto';
import { DrawingsService, type DrawingPreviewResult } from './drawings.service';

function isDrawingViewKey(value: string): value is DrawingViewKey {
  return (DRAWING_VIEW_KEYS as readonly string[]).includes(value);
}

export interface DrawingResponse extends Drawing {
  /** Faz D7: urun gorseli/avatar ile ayni desen - R2 anahtari degil, `/files` proxy
   * uzerinden hazir, indirilebilir bir URL (bkz. FileUrlService). */
  exportFileUrl: string | null;
}

@ModulePage('drawings')
@Controller('drawings')
export class DrawingsController {
  constructor(
    private readonly drawings: DrawingsService,
    private readonly drawingExport: DrawingExportService,
    private readonly fileUrl: FileUrlService,
  ) {}

  private toResponse(drawing: Drawing): DrawingResponse {
    return {
      ...drawing,
      exportFileUrl: this.fileUrl.build(
        drawing.exportFileKey,
        drawing.updatedAt,
        `${drawing.name}.pdf`,
      ),
    };
  }

  @Get()
  @RequiresPermission('drawings', 'VIEW')
  async list(
    @Query(new ZodValidationPipe(DrawingQuerySchema)) query: DrawingQueryDto,
  ): Promise<DrawingResponse[]> {
    const drawings = await this.drawings.list(query);
    return drawings.map((d) => this.toResponse(d));
  }

  @Get(':id')
  @RequiresPermission('drawings', 'VIEW')
  async getById(@Param('id') id: string): Promise<DrawingResponse> {
    return this.toResponse(await this.drawings.getById(id));
  }

  @Post('preview')
  @RequiresPermission('drawings', 'VIEW')
  preview(
    @Body(new ZodValidationPipe(DrawingPreviewRequestSchema))
    dto: DrawingPreviewRequestDto,
  ): Promise<DrawingPreviewResult> {
    return this.drawings.preview(dto);
  }

  @Post()
  @RequiresPermission('drawings', 'CREATE')
  async create(
    @Body(new ZodValidationPipe(CreateDrawingSchema)) dto: CreateDrawingDto,
  ): Promise<DrawingResponse> {
    return this.toResponse(await this.drawings.create(dto));
  }

  @Patch(':id')
  @RequiresPermission('drawings', 'UPDATE')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateDrawingSchema)) dto: UpdateDrawingDto,
  ): Promise<DrawingResponse> {
    return this.toResponse(await this.drawings.update(id, dto));
  }

  @Delete(':id')
  @RequiresPermission('drawings', 'DELETE')
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.drawings.remove(id);
  }

  /**
   * Faz D7: tek bir gorunumun SVG'si - saf/determinist bir fonksiyonun ciktisi
   * oldugu icin hic persist edilmeden her istekte anlik uretilir (bkz.
   * drawing-export.service.ts yorumu).
   */
  @Get(':id/export/svg')
  @RequiresPermission('drawings', 'EXPORT')
  async exportSvg(
    @Param('id') id: string,
    @Query('view') view: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    if (!view || !isDrawingViewKey(view)) {
      throw new AppException(
        'INVALID_VIEW',
        'Gecersiz gorunum. internal, coverPlate veya external olmali.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const svg = await this.drawingExport.renderSvg(id, view);
    res.set({ 'Content-Type': 'image/svg+xml; charset=utf-8' });
    res.send(svg);
  }

  /**
   * Faz D8: butun model (3 gorunum + bara) tek bir DXF dosyasinda, her gorunum kendi
   * katmaninda (layer) - SVG gibi hic persist edilmeden anlik uretilir (bkz.
   * drawing-export.service.ts yorumu).
   */
  @Get(':id/export/dxf')
  @RequiresPermission('drawings', 'EXPORT')
  async exportDxf(
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const dxf = await this.drawingExport.renderDxf(id);
    res.set({ 'Content-Type': 'application/dxf; charset=utf-8' });
    res.send(dxf);
  }

  /**
   * Faz D7: 3 gorunumu de iceren birlesik PDF - R2'ye yuklenir, Drawing.exportedAt/
   * exportFileKey guncellenir; indirme mevcut `/files` proxy'si uzerinden yapilir
   * (urun gorseli/avatar ile ayni desen).
   */
  @Post(':id/export/pdf')
  @RequiresPermission('drawings', 'EXPORT')
  async exportPdf(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<DrawingResponse> {
    return this.toResponse(
      await this.drawingExport.exportPdf(id, user.tenantId),
    );
  }
}
