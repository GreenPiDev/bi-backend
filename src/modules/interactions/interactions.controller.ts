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
import {
  CurrentUser,
  type RequestUser,
} from '../../core/decorators/current-user.decorator';
import { ModulePage } from '../../core/decorators/module-page.decorator';
import { RequiresPermission } from '../../core/decorators/requires-permission.decorator';
import type { PagedResult } from '../../core/dto/list-query.dto';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import {
  CreateInteractionSchema,
  InteractionQuerySchema,
  UpdateInteractionSchema,
  type CreateInteractionDto,
  type InteractionQueryDto,
  type UpdateInteractionDto,
} from './dto/interaction.dto';
import {
  InteractionsService,
  type CreateInteractionResult,
  type InteractionWithDetails,
} from './interactions.service';

@ModulePage('interactions')
@Controller('interactions')
export class InteractionsController {
  constructor(private readonly interactions: InteractionsService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(InteractionQuerySchema))
    query: InteractionQueryDto,
  ): Promise<PagedResult<InteractionWithDetails>> {
    return this.interactions.list(query);
  }

  @Get(':id')
  getById(@Param('id') id: string): Promise<InteractionWithDetails> {
    return this.interactions.getById(id);
  }

  @Post()
  @RequiresPermission('interactions', 'CREATE')
  create(
    @Body(new ZodValidationPipe(CreateInteractionSchema))
    dto: CreateInteractionDto,
    @CurrentUser() user: RequestUser,
  ): Promise<CreateInteractionResult> {
    return this.interactions.create(user.tenantId, user.id, dto);
  }

  @Patch(':id')
  @RequiresPermission('interactions', 'UPDATE')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateInteractionSchema))
    dto: UpdateInteractionDto,
  ): Promise<InteractionWithDetails> {
    return this.interactions.update(id, dto);
  }

  @Delete(':id')
  @RequiresPermission('interactions', 'DELETE')
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.interactions.remove(id);
  }
}
