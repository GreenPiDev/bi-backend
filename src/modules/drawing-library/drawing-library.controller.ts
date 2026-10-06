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
import type { DrawingLibraryComponent } from '@prisma/client';
import { ModulePage } from '../../core/decorators/module-page.decorator';
import { RequiresPermission } from '../../core/decorators/requires-permission.decorator';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import {
  CreateDrawingLibraryComponentSchema,
  UpdateDrawingLibraryComponentSchema,
  type CreateDrawingLibraryComponentDto,
  type UpdateDrawingLibraryComponentDto,
} from './dto/drawing-library-component.dto';
import { DrawingLibraryService } from './drawing-library.service';

@ModulePage('drawing-library')
@Controller('drawing-library')
export class DrawingLibraryController {
  constructor(private readonly drawingLibrary: DrawingLibraryService) {}

  @Get()
  @RequiresPermission('drawing-library', 'VIEW')
  list(): Promise<DrawingLibraryComponent[]> {
    return this.drawingLibrary.list();
  }

  @Post()
  @RequiresPermission('drawing-library', 'CREATE')
  create(
    @Body(new ZodValidationPipe(CreateDrawingLibraryComponentSchema))
    dto: CreateDrawingLibraryComponentDto,
  ): Promise<DrawingLibraryComponent> {
    return this.drawingLibrary.create(dto);
  }

  @Patch(':id')
  @RequiresPermission('drawing-library', 'UPDATE')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateDrawingLibraryComponentSchema))
    dto: UpdateDrawingLibraryComponentDto,
  ): Promise<DrawingLibraryComponent> {
    return this.drawingLibrary.update(id, dto);
  }

  @Delete(':id')
  @RequiresPermission('drawing-library', 'DELETE')
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.drawingLibrary.remove(id);
  }
}
