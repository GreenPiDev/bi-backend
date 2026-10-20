import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { Survey } from '@prisma/client';
import { ModulePage } from '../../core/decorators/module-page.decorator';
import {
  CurrentUser,
  type RequestUser,
} from '../../core/decorators/current-user.decorator';
import { RequiresPermission } from '../../core/decorators/requires-permission.decorator';
import type { PagedResult } from '../../core/dto/list-query.dto';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import {
  CreateSurveySchema,
  SurveyQuerySchema,
  UpdateSurveySchema,
  type CreateSurveyDto,
  type SurveyQueryDto,
  type UpdateSurveyDto,
} from './dto/survey.dto';
import { SurveysService, type SurveyWithQuestions } from './surveys.service';

@ModulePage('surveys')
@Controller('surveys')
export class SurveysController {
  constructor(private readonly surveys: SurveysService) {}

  @Get()
  @RequiresPermission('surveys', 'VIEW')
  list(
    @Query(new ZodValidationPipe(SurveyQuerySchema)) query: SurveyQueryDto,
  ): Promise<PagedResult<SurveyWithQuestions>> {
    return this.surveys.list(query);
  }

  /** Aktif anketler - PostSaleCase gonderim ekranindaki secici icin. */
  @Get('active')
  @RequiresPermission('surveys', 'VIEW')
  listActive(): Promise<Survey[]> {
    return this.surveys.listActive();
  }

  @Get(':id')
  @RequiresPermission('surveys', 'VIEW')
  getById(@Param('id') id: string): Promise<SurveyWithQuestions> {
    return this.surveys.getById(id);
  }

  @Post()
  @RequiresPermission('surveys', 'CREATE')
  create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(CreateSurveySchema)) dto: CreateSurveyDto,
  ): Promise<SurveyWithQuestions> {
    return this.surveys.create(user.id, dto);
  }

  @Patch(':id')
  @RequiresPermission('surveys', 'UPDATE')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateSurveySchema)) dto: UpdateSurveyDto,
  ): Promise<SurveyWithQuestions> {
    return this.surveys.update(id, dto);
  }

  @Delete(':id')
  @RequiresPermission('surveys', 'DELETE')
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.surveys.remove(id);
  }
}
