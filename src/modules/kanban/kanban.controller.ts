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
import {
  CurrentUser,
  type RequestUser,
} from '../../core/decorators/current-user.decorator';
import { ModulePage } from '../../core/decorators/module-page.decorator';
import { RequiresPermission } from '../../core/decorators/requires-permission.decorator';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import {
  CreateKanbanBoardSchema,
  CreateKanbanCardSchema,
  MoveKanbanCardSchema,
  UpdateKanbanBoardSchema,
  UpdateKanbanCardSchema,
  type CreateKanbanBoardDto,
  type CreateKanbanCardDto,
  type MoveKanbanCardDto,
  type UpdateKanbanBoardDto,
  type UpdateKanbanCardDto,
} from './dto/kanban.dto';
import {
  KanbanBoardsService,
  type KanbanBoardSummary,
} from './kanban-boards.service';
import type { KanbanBoardDetail, KanbanCardView } from './kanban-card-view';
import { KanbanAssigneesService } from './kanban-assignees.service';
import { KanbanCardsService } from './kanban-cards.service';

@ModulePage('kanban')
@Controller('kanban')
export class KanbanController {
  constructor(
    private readonly boards: KanbanBoardsService,
    private readonly cards: KanbanCardsService,
    private readonly assignees: KanbanAssigneesService,
  ) {}

  @Get('boards')
  @RequiresPermission('kanban', 'VIEW')
  list(@CurrentUser() user: RequestUser): Promise<KanbanBoardSummary[]> {
    return this.boards.list(user.tenantId);
  }

  @Get('assignable-users')
  @RequiresPermission('kanban', 'VIEW')
  listAssignableUsers(): Promise<
    { id: string; name: string; avatarUrl: string | null }[]
  > {
    return this.assignees.list();
  }

  @Post('boards')
  @RequiresPermission('kanban', 'CREATE')
  create(
    @Body(new ZodValidationPipe(CreateKanbanBoardSchema))
    dto: CreateKanbanBoardDto,
    @CurrentUser() user: RequestUser,
  ): Promise<KanbanBoardSummary> {
    return this.boards.create(user.tenantId, user.id, dto);
  }

  @Get('boards/:id')
  @RequiresPermission('kanban', 'VIEW')
  getById(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<KanbanBoardDetail> {
    return this.cards.getBoard(id, user.tenantId);
  }

  @Patch('boards/:id')
  @HttpCode(204)
  @RequiresPermission('kanban', 'UPDATE')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateKanbanBoardSchema))
    dto: UpdateKanbanBoardDto,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    return this.boards.update(id, user.tenantId, dto);
  }

  @Delete('boards/:id')
  @HttpCode(204)
  @RequiresPermission('kanban', 'DELETE')
  remove(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    return this.boards.remove(id, user.tenantId);
  }

  @Post('boards/:id/cards')
  @RequiresPermission('kanban', 'CREATE')
  createCard(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(CreateKanbanCardSchema))
    dto: CreateKanbanCardDto,
    @CurrentUser() user: RequestUser,
  ): Promise<KanbanCardView> {
    return this.cards.createCard(id, user.tenantId, user.id, dto);
  }

  @Patch('boards/:id/cards/:cardId')
  @RequiresPermission('kanban', 'UPDATE')
  updateCard(
    @Param('id') id: string,
    @Param('cardId') cardId: string,
    @Body(new ZodValidationPipe(UpdateKanbanCardSchema))
    dto: UpdateKanbanCardDto,
    @CurrentUser() user: RequestUser,
  ): Promise<KanbanCardView> {
    return this.cards.updateCard(id, cardId, user.tenantId, user.id, dto);
  }

  @Post('boards/:id/cards/:cardId/move')
  @HttpCode(204)
  @RequiresPermission('kanban', 'UPDATE')
  moveCard(
    @Param('id') id: string,
    @Param('cardId') cardId: string,
    @Body(new ZodValidationPipe(MoveKanbanCardSchema)) dto: MoveKanbanCardDto,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    return this.cards.moveCard(id, cardId, user.tenantId, user.id, dto);
  }

  @Delete('boards/:id/cards/:cardId')
  @HttpCode(204)
  @RequiresPermission('kanban', 'DELETE')
  removeCard(
    @Param('id') id: string,
    @Param('cardId') cardId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    return this.cards.removeCard(id, cardId, user.tenantId);
  }
}
