import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { KanbanAssigneesService } from './kanban-assignees.service';
import { KanbanBoardsService } from './kanban-boards.service';
import { KanbanCardsService } from './kanban-cards.service';
import { KanbanController } from './kanban.controller';

@Module({
  imports: [NotificationsModule],
  controllers: [KanbanController],
  providers: [KanbanBoardsService, KanbanCardsService, KanbanAssigneesService],
})
export class KanbanModule {}
