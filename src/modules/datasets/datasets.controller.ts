import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import type { Dataset } from '@prisma/client';
import {
  CurrentUser,
  type RequestUser,
} from '../../core/decorators/current-user.decorator';
import { RequiresPermission } from '../../core/decorators/requires-permission.decorator';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import {
  DatasetsService,
  type DatasetWithFields,
  type PreviewResult,
} from './datasets.service';
import {
  UpdateDatasetFieldsSchema,
  type UpdateDatasetFieldsDto,
} from './dto/update-dataset-fields.dto';

@Controller('datasets')
export class DatasetsController {
  constructor(private readonly datasets: DatasetsService) {}

  @Get()
  list(): Promise<Dataset[]> {
    return this.datasets.list();
  }

  @Get(':id')
  getById(@Param('id') id: string): Promise<DatasetWithFields> {
    return this.datasets.getById(id);
  }

  @Post(':id/preview')
  preview(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<PreviewResult> {
    return this.datasets.preview(id, user.tenantId);
  }

  @Patch(':id/fields')
  @RequiresPermission('datasets', 'UPDATE')
  updateFields(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateDatasetFieldsSchema))
    dto: UpdateDatasetFieldsDto,
    @CurrentUser() user: RequestUser,
  ): Promise<DatasetWithFields> {
    return this.datasets.updateFields(id, user.tenantId, dto.fields);
  }
}
