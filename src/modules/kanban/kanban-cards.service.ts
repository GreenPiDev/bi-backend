import { HttpStatus, Injectable } from '@nestjs/common';
import type { KanbanBoard, KanbanCard } from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import { PrismaService } from '../../core/prisma/prisma.service';
import { FileUrlService } from '../../core/storage/file-url.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import type {
  CreateKanbanCardDto,
  MoveKanbanCardDto,
  UpdateKanbanCardDto,
} from './dto/kanban.dto';
import { KanbanAssigneesService } from './kanban-assignees.service';
import { KanbanBoardsService } from './kanban-boards.service';
import { moveSideEffects } from './kanban-card-rules';
import {
  CARD_INCLUDE,
  fromDateOnly,
  toKanbanCardView,
  type KanbanBoardDetail,
  type KanbanCardView,
} from './kanban-card-view';

/**
 * Kart islemleri - erisim her zaman KanbanBoardsService.findAccessible uzerinden
 * pano seviyesinde dogrulanir (kart tenantId tasimaz). Atanan kisi her zaman
 * islemi yapanin KENDI tenant'indan secilir (KanbanAssigneesService); bildirim de
 * bu yuzden islemi yapanin tenant'inda olusturulur.
 */
@Injectable()
export class KanbanCardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assignees: KanbanAssigneesService,
    private readonly boards: KanbanBoardsService,
    private readonly fileUrl: FileUrlService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async getBoard(id: string, tenantId: string): Promise<KanbanBoardDetail> {
    await this.boards.findAccessible(id, tenantId);
    const board = await this.prisma.kanbanBoard.findFirstOrThrow({
      where: { id },
      include: {
        tenant: { select: { id: true, name: true } },
        partnerTenant: { select: { id: true, name: true } },
        cards: {
          include: CARD_INCLUDE,
          orderBy: [{ column: 'asc' }, { position: 'asc' }],
        },
      },
    });
    return {
      id: board.id,
      name: board.name,
      isOwner: board.tenantId === tenantId,
      ownerTenant: board.tenant,
      partnerTenant: board.partnerTenant,
      cards: board.cards.map((card) =>
        toKanbanCardView(card, tenantId, this.fileUrl),
      ),
    };
  }

  private async findCard(
    boardId: string,
    cardId: string,
    tenantId: string,
  ): Promise<{ board: KanbanBoard; card: KanbanCard }> {
    const board = await this.boards.findAccessible(boardId, tenantId);
    const card = await this.prisma.kanbanCard.findFirst({
      where: { id: cardId, boardId },
    });
    if (!card) {
      throw new AppException(
        'NOT_FOUND',
        'Kart bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    if (card.column === 'DONE') {
      throw new AppException(
        'KANBAN_CARD_LOCKED',
        'Tamamlanan kart degistirilemez.',
        HttpStatus.CONFLICT,
      );
    }
    return { board, card };
  }

  private async notifyAssignee(
    tenantId: string,
    actorId: string,
    assigneeUserId: string | null,
    board: KanbanBoard,
    title: string,
  ): Promise<void> {
    if (!assigneeUserId || assigneeUserId === actorId) return;
    await this.notifications.create(tenantId, {
      recipientUserId: assigneeUserId,
      type: 'KANBAN_CARD_ASSIGNED',
      title: `Size yeni bir gorev atandi: "${title}" (${board.name})`,
      relatedEntityType: 'KanbanBoard',
      relatedEntityId: board.id,
      createdById: actorId,
    });
  }

  async createCard(
    boardId: string,
    tenantId: string,
    userId: string,
    dto: CreateKanbanCardDto,
  ): Promise<KanbanCardView> {
    const board = await this.boards.findAccessible(boardId, tenantId);
    if (dto.assigneeUserId)
      await this.assignees.assertAssignable(dto.assigneeUserId);
    // Yeni kart Yapilacak kolonunun EN USTUNE eklenir (varsayilan "en yeni ustte");
    // mevcut kartlar bir sira asagi kayar, elle verilmis goreli sira korunur.
    const [, card] = await this.prisma.$transaction([
      this.prisma.kanbanCard.updateMany({
        where: { boardId, column: 'TODO' },
        data: { position: { increment: 1 } },
      }),
      this.prisma.kanbanCard.create({
        data: {
          boardId,
          title: dto.title,
          description: dto.description || null,
          assigneeUserId: dto.assigneeUserId ?? null,
          priority: dto.priority,
          dueDate: fromDateOnly(dto.dueDate),
          column: 'TODO',
          position: 0,
          createdById: userId,
          createdByTenantId: tenantId,
        },
        include: CARD_INCLUDE,
      }),
    ]);
    await this.audit.log({
      action: 'CREATE',
      entity: 'KanbanCard',
      entityId: card.id,
    });
    await this.notifyAssignee(
      tenantId,
      userId,
      card.assigneeUserId,
      board,
      card.title,
    );
    this.boards.emitChanged(board);
    return toKanbanCardView(card, tenantId, this.fileUrl);
  }

  async updateCard(
    boardId: string,
    cardId: string,
    tenantId: string,
    userId: string,
    dto: UpdateKanbanCardDto,
  ): Promise<KanbanCardView> {
    const { board, card } = await this.findCard(boardId, cardId, tenantId);
    const assigneeChanged =
      dto.assigneeUserId !== undefined &&
      dto.assigneeUserId !== card.assigneeUserId;
    if (assigneeChanged && dto.assigneeUserId) {
      await this.assignees.assertAssignable(dto.assigneeUserId);
    }
    const updated = await this.prisma.kanbanCard.update({
      where: { id: cardId },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description || null }
          : {}),
        ...(assigneeChanged ? { assigneeUserId: dto.assigneeUserId } : {}),
        ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
        ...(dto.dueDate !== undefined
          ? { dueDate: fromDateOnly(dto.dueDate) }
          : {}),
      },
      include: CARD_INCLUDE,
    });
    await this.audit.log({
      action: 'UPDATE',
      entity: 'KanbanCard',
      entityId: cardId,
    });
    if (assigneeChanged) {
      await this.notifyAssignee(
        tenantId,
        userId,
        updated.assigneeUserId,
        board,
        updated.title,
      );
    }
    this.boards.emitChanged(board);
    return toKanbanCardView(updated, tenantId, this.fileUrl);
  }

  /**
   * Karti hedef kolonda `index` sirasina yerlestirir, hedef kolonu 0..n yeniden yazar.
   * DONE kart findCard'da reddedilir; diger yan etkiler: kanban-card-rules.ts.
   */
  async moveCard(
    boardId: string,
    cardId: string,
    tenantId: string,
    userId: string,
    dto: MoveKanbanCardDto,
  ): Promise<void> {
    const { board, card } = await this.findCard(boardId, cardId, tenantId);
    const sideEffects = moveSideEffects(card, dto, userId);
    await this.prisma.$transaction(async (tx) => {
      const siblings = await tx.kanbanCard.findMany({
        where: { boardId, column: dto.column, id: { not: cardId } },
        orderBy: { position: 'asc' },
        select: { id: true, position: true },
      });
      const index = Math.min(dto.index, siblings.length);
      const ordered = [
        ...siblings.slice(0, index).map((sibling) => sibling.id),
        cardId,
        ...siblings.slice(index).map((sibling) => sibling.id),
      ];
      const previous = new Map(
        siblings.map((sibling) => [sibling.id, sibling.position]),
      );
      for (const [position, id] of ordered.entries()) {
        if (id === cardId) {
          await tx.kanbanCard.update({
            where: { id },
            data: {
              column: dto.column,
              position,
              ...sideEffects.cardData,
            },
          });
        } else if (previous.get(id) !== position) {
          await tx.kanbanCard.update({ where: { id }, data: { position } });
        }
      }
      if (sideEffects.revisionNote) {
        await tx.kanbanCardRevision.create({
          data: { cardId, note: sideEffects.revisionNote, createdById: userId },
        });
      }
      if (sideEffects.progressNote) {
        await tx.kanbanCardProgressNote.create({
          data: { cardId, note: sideEffects.progressNote, createdById: userId },
        });
      }
    });
    if (card.column !== dto.column) {
      await this.audit.log({
        action: 'UPDATE',
        entity: 'KanbanCard',
        entityId: cardId,
        meta: { from: card.column, to: dto.column },
      });
    }
    this.boards.emitChanged(board);
  }

  async removeCard(
    boardId: string,
    cardId: string,
    tenantId: string,
  ): Promise<void> {
    const { board } = await this.findCard(boardId, cardId, tenantId);
    await this.prisma.kanbanCard.delete({ where: { id: cardId } });
    await this.audit.log({
      action: 'DELETE',
      entity: 'KanbanCard',
      entityId: cardId,
    });
    this.boards.emitChanged(board);
  }
}
