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
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  CurrentUser,
  type RequestUser,
} from '../../core/decorators/current-user.decorator';
import { ModulePage } from '../../core/decorators/module-page.decorator';
import { RequiresPermission } from '../../core/decorators/requires-permission.decorator';
import type { PagedResult } from '../../core/dto/list-query.dto';
import {
  parseExportFormat,
  sendExportFile,
} from '../../core/http/export-response.util';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import {
  CreateInteractionSchema,
  InteractionExportQuerySchema,
  InteractionQuerySchema,
  UpdateInteractionSchema,
  type CreateInteractionDto,
  type InteractionExportQueryDto,
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
  @RequiresPermission('interactions', 'VIEW')
  list(
    @Query(new ZodValidationPipe(InteractionQuerySchema))
    query: InteractionQueryDto,
  ): Promise<PagedResult<InteractionWithDetails>> {
    return this.interactions.list(query);
  }

  @Get('creators')
  @RequiresPermission('interactions', 'VIEW')
  listCreators(): Promise<{ id: string; name: string }[]> {
    return this.interactions.listCreators();
  }

  @Get('export')
  @RequiresPermission('interactions', 'EXPORT')
  async export(
    @Query('format') formatRaw: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const format = parseExportFormat(formatRaw);
    const buffer = await this.interactions.exportInteractions(format);
    sendExportFile(res, buffer, format, 'gorusmeler');
  }

  /** Ad-hoc (2026-10-20, kullanici istegi, bkz. CLAUDE.md): accounts/contacts/
   * sales-orders'taki ayni merkezi "filtre+gorunur kolon" Excel export yapisi -
   * yukaridaki export() (PDF+Excel, tum kayit, sabit kolon) kasitli olarak
   * DOKUNULMADI, bu YENI ve ayri bir uc. */
  @Get('export-filtered')
  @RequiresPermission('interactions', 'EXPORT')
  async exportFiltered(
    @Query(new ZodValidationPipe(InteractionExportQuerySchema))
    query: InteractionExportQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    const buffer = await this.interactions.exportFiltered(query);
    sendExportFile(res, buffer, 'xlsx', 'gorusmeler');
  }

  @Get(':id')
  @RequiresPermission('interactions', 'VIEW')
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
