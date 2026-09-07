import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ModulePage } from '../../core/decorators/module-page.decorator';
import { RequiresPermission } from '../../core/decorators/requires-permission.decorator';
import type { PagedResult } from '../../core/dto/list-query.dto';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import {
  MarkPostSaleFeedbackSchema,
  PostSaleCaseQuerySchema,
  SendPostSaleSurveySchema,
  type MarkPostSaleFeedbackDto,
  type PostSaleCaseQueryDto,
  type SendPostSaleSurveyDto,
} from './dto/post-sale-case.dto';
import {
  PostSaleCasesService,
  type PostSaleCaseWithDetails,
} from './post-sale-cases.service';

@ModulePage('post-sale-cases')
@Controller('post-sale-cases')
export class PostSaleCasesController {
  constructor(private readonly postSaleCases: PostSaleCasesService) {}

  @Get()
  @RequiresPermission('post-sale-cases', 'VIEW')
  list(
    @Query(new ZodValidationPipe(PostSaleCaseQuerySchema))
    query: PostSaleCaseQueryDto,
  ): Promise<PagedResult<PostSaleCaseWithDetails>> {
    return this.postSaleCases.list(query);
  }

  @Get(':id')
  @RequiresPermission('post-sale-cases', 'VIEW')
  getById(@Param('id') id: string): Promise<PostSaleCaseWithDetails> {
    return this.postSaleCases.getById(id);
  }

  @Post(':id/send-survey')
  @RequiresPermission('post-sale-cases', 'UPDATE')
  sendSurvey(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(SendPostSaleSurveySchema))
    dto: SendPostSaleSurveyDto,
  ): Promise<PostSaleCaseWithDetails> {
    return this.postSaleCases.sendSurvey(id, dto);
  }

  @Patch(':id/feedback')
  @RequiresPermission('post-sale-cases', 'UPDATE')
  markFeedback(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(MarkPostSaleFeedbackSchema))
    dto: MarkPostSaleFeedbackDto,
  ): Promise<PostSaleCaseWithDetails> {
    return this.postSaleCases.markFeedback(id, dto);
  }
}
