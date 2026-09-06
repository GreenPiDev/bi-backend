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
import type { Opportunity } from '@prisma/client';
import {
  CurrentUser,
  type RequestUser,
} from '../../core/decorators/current-user.decorator';
import { ModulePage } from '../../core/decorators/module-page.decorator';
import { RequiresPermission } from '../../core/decorators/requires-permission.decorator';
import type { PagedResult } from '../../core/dto/list-query.dto';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import {
  CreateOpportunitySchema,
  OpportunityQuerySchema,
  UpdateOpportunitySchema,
  type CreateOpportunityDto,
  type OpportunityQueryDto,
  type UpdateOpportunityDto,
} from './dto/opportunity.dto';
import { OpportunitiesService } from './opportunities.service';

@ModulePage('opportunities')
@Controller('opportunities')
export class OpportunitiesController {
  constructor(private readonly opportunities: OpportunitiesService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(OpportunityQuerySchema))
    query: OpportunityQueryDto,
  ): Promise<PagedResult<Opportunity>> {
    return this.opportunities.list(query);
  }

  @Get(':id')
  getById(@Param('id') id: string): Promise<Opportunity> {
    return this.opportunities.getById(id);
  }

  @Post()
  @RequiresPermission('opportunities', 'CREATE')
  create(
    @Body(new ZodValidationPipe(CreateOpportunitySchema))
    dto: CreateOpportunityDto,
    @CurrentUser() user: RequestUser,
  ): Promise<Opportunity> {
    return this.opportunities.create(user.id, dto);
  }

  @Patch(':id')
  @RequiresPermission('opportunities', 'UPDATE')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateOpportunitySchema))
    dto: UpdateOpportunityDto,
  ): Promise<Opportunity> {
    return this.opportunities.update(id, dto);
  }

  @Delete(':id')
  @RequiresPermission('opportunities', 'DELETE')
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.opportunities.remove(id);
  }
}
