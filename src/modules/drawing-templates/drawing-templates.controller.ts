import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import type { DrawingPanelTemplate } from '@prisma/client';
import { ModulePage } from '../../core/decorators/module-page.decorator';
import { RequiresPermission } from '../../core/decorators/requires-permission.decorator';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import {
  CreateDrawingPanelTemplateSchema,
  UpdateDrawingPanelTemplateSchema,
  type CreateDrawingPanelTemplateDto,
  type UpdateDrawingPanelTemplateDto,
} from './dto/drawing-panel-template.dto';
import { DrawingTemplatesService } from './drawing-templates.service';

@ModulePage('drawing-templates')
@Controller('drawing-templates')
export class DrawingTemplatesController {
  constructor(private readonly drawingTemplates: DrawingTemplatesService) {}

  @Get()
  @RequiresPermission('drawing-templates', 'VIEW')
  list(): Promise<DrawingPanelTemplate[]> {
    return this.drawingTemplates.list();
  }

  @Post()
  @RequiresPermission('drawing-templates', 'CREATE')
  create(
    @Body(new ZodValidationPipe(CreateDrawingPanelTemplateSchema))
    dto: CreateDrawingPanelTemplateDto,
  ): Promise<DrawingPanelTemplate> {
    return this.drawingTemplates.create(dto);
  }

  @Patch(':id')
  @RequiresPermission('drawing-templates', 'UPDATE')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateDrawingPanelTemplateSchema))
    dto: UpdateDrawingPanelTemplateDto,
  ): Promise<DrawingPanelTemplate> {
    return this.drawingTemplates.update(id, dto);
  }

  @Delete(':id')
  @RequiresPermission('drawing-templates', 'DELETE')
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.drawingTemplates.remove(id);
  }
}
