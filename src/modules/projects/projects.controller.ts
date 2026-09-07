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
import type { Project } from '@prisma/client';
import {
  CurrentUser,
  type RequestUser,
} from '../../core/decorators/current-user.decorator';
import { ModulePage } from '../../core/decorators/module-page.decorator';
import { RequiresPermission } from '../../core/decorators/requires-permission.decorator';
import type { PagedResult } from '../../core/dto/list-query.dto';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import {
  CreateProjectSchema,
  ProjectQuerySchema,
  UpdateProjectSchema,
  type CreateProjectDto,
  type ProjectQueryDto,
  type UpdateProjectDto,
} from './dto/project.dto';
import { ProjectsService } from './projects.service';

@ModulePage('projects')
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  @RequiresPermission('projects', 'VIEW')
  list(
    @Query(new ZodValidationPipe(ProjectQuerySchema))
    query: ProjectQueryDto,
  ): Promise<PagedResult<Project>> {
    return this.projects.list(query);
  }

  @Get(':id')
  @RequiresPermission('projects', 'VIEW')
  getById(@Param('id') id: string): Promise<Project> {
    return this.projects.getById(id);
  }

  @Post()
  @RequiresPermission('projects', 'CREATE')
  create(
    @Body(new ZodValidationPipe(CreateProjectSchema))
    dto: CreateProjectDto,
    @CurrentUser() user: RequestUser,
  ): Promise<Project> {
    return this.projects.create(user.id, dto);
  }

  @Patch(':id')
  @RequiresPermission('projects', 'UPDATE')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateProjectSchema))
    dto: UpdateProjectDto,
  ): Promise<Project> {
    return this.projects.update(id, dto);
  }

  @Delete(':id')
  @RequiresPermission('projects', 'DELETE')
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.projects.remove(id);
  }
}
