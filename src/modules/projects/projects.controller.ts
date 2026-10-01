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
import {
  CurrentUser,
  type RequestUser,
} from '../../core/decorators/current-user.decorator';
import { ModulePage } from '../../core/decorators/module-page.decorator';
import { RequiresPermission } from '../../core/decorators/requires-permission.decorator';
import type { PagedResult } from '../../core/dto/list-query.dto';
import { AppException } from '../../core/errors/app.exception';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import {
  CreateProjectSchema,
  ProjectQuerySchema,
  RenameProjectAttachmentSchema,
  UpdateProjectSchema,
  type CreateProjectDto,
  type ProjectQueryDto,
  type RenameProjectAttachmentDto,
  type UpdateProjectDto,
} from './dto/project.dto';
import {
  MAX_PROJECT_ATTACHMENT_SIZE_BYTES,
  ProjectsService,
  type ProjectAttachmentView,
  type ProjectListItem,
  type ProjectWithQuotes,
} from './projects.service';

@ModulePage('projects')
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  @RequiresPermission('projects', 'VIEW')
  list(
    @Query(new ZodValidationPipe(ProjectQuerySchema))
    query: ProjectQueryDto,
  ): Promise<PagedResult<ProjectListItem>> {
    return this.projects.list(query);
  }

  @Get('assignable-users')
  @RequiresPermission('projects', 'VIEW')
  listAssignableUsers(): Promise<{ id: string; name: string }[]> {
    return this.projects.listAssignableUsers();
  }

  @Get(':id')
  @RequiresPermission('projects', 'VIEW')
  getById(@Param('id') id: string): Promise<ProjectWithQuotes> {
    return this.projects.getById(id);
  }

  @Post()
  @RequiresPermission('projects', 'CREATE')
  create(
    @Body(new ZodValidationPipe(CreateProjectSchema))
    dto: CreateProjectDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ProjectWithQuotes> {
    return this.projects.create(user.id, dto);
  }

  /** Hem "Yeni Proje" (olusturma basarili olduktan hemen sonra) hem "Duzenle"
   * sayfasindan cagrilir - dosya secimi aninda degil, form "Kaydet"e basilinca
   * yuklenir (bkz. ProjectsService.addAttachment doc comment'i). */
  @Post(':id/attachments')
  @RequiresPermission('projects', 'UPDATE')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_PROJECT_ATTACHMENT_SIZE_BYTES },
    }),
  )
  addAttachment(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ProjectAttachmentView> {
    if (!file) {
      throw new AppException(
        'FILE_REQUIRED',
        'Dosya yuklenmedi.',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.projects.addAttachment(id, user.tenantId, file);
  }

  @Delete(':id/attachments/:attachmentId')
  @HttpCode(204)
  @RequiresPermission('projects', 'UPDATE')
  removeAttachment(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
  ): Promise<void> {
    return this.projects.removeAttachment(id, attachmentId);
  }

  @Patch(':id/attachments/:attachmentId')
  @RequiresPermission('projects', 'UPDATE')
  renameAttachment(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @Body(new ZodValidationPipe(RenameProjectAttachmentSchema))
    dto: RenameProjectAttachmentDto,
  ): Promise<ProjectAttachmentView> {
    return this.projects.renameAttachment(id, attachmentId, dto.fileName);
  }

  @Patch(':id')
  @RequiresPermission('projects', 'UPDATE')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateProjectSchema))
    dto: UpdateProjectDto,
  ): Promise<ProjectWithQuotes> {
    return this.projects.update(id, dto);
  }

  @Delete(':id')
  @RequiresPermission('projects', 'DELETE')
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.projects.remove(id);
  }
}
