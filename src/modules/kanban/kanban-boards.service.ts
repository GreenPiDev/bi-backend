import { HttpStatus, Injectable } from '@nestjs/common';
import type { KanbanBoard, KanbanColumn } from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import { PrismaService } from '../../core/prisma/prisma.service';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { AuditService } from '../audit/audit.service';
import type {
  CreateKanbanBoardDto,
  UpdateKanbanBoardDto,
} from './dto/kanban.dto';

export const KANBAN_BOARD_CHANGED_EVENT = 'kanban.board.changed';

export interface KanbanTenantRef {
  id: string;
  name: string;
}

export interface KanbanBoardSummary {
  id: string;
  name: string;
  isOwner: boolean;
  ownerTenant: KanbanTenantRef;
  partnerTenant: KanbanTenantRef | null;
  cardCounts: Record<KanbanColumn, number>;
  createdAt: Date;
}

const EMPTY_COUNTS: Record<KanbanColumn, number> = {
  TODO: 0,
  IN_PROGRESS: 0,
  IN_REVIEW: 0,
  DONE: 0,
};

const TENANT_REF_SELECT = { select: { id: true, name: true } } as const;

/**
 * KanbanBoard tenant'lar-arasi paylasilabildigi icin (sahip + tek ortak tenant) bu
 * servis tenant-scoped extension yerine BILEREK ham PrismaService kullanir; tenant
 * izolasyonu her sorguda `accessibleWhere()` ile elle uygulanir - erisimi olmayan
 * tenant her zaman 404 alir (CLAUDE.md SS5.7). Bkz. docs/VARSAYIMLAR.md (Kanban).
 */
@Injectable()
export class KanbanBoardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly audit: AuditService,
  ) {}

  private accessibleWhere(tenantId: string) {
    return {
      deletedAt: null,
      OR: [{ tenantId }, { partnerTenantId: tenantId }],
    };
  }

  async findAccessible(id: string, tenantId: string): Promise<KanbanBoard> {
    const board = await this.prisma.kanbanBoard.findFirst({
      where: { id, ...this.accessibleWhere(tenantId) },
    });
    if (!board) {
      throw new AppException(
        'NOT_FOUND',
        'Kanban panosu bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    return board;
  }

  /** Panoyu acik tutan HER IKI tenant'in ekranini anlik gunceller. */
  emitChanged(board: Pick<KanbanBoard, 'id' | 'tenantId' | 'partnerTenantId'>) {
    const payload = { boardId: board.id };
    this.realtime.emitToTenant(
      board.tenantId,
      KANBAN_BOARD_CHANGED_EVENT,
      payload,
    );
    if (board.partnerTenantId) {
      this.realtime.emitToTenant(
        board.partnerTenantId,
        KANBAN_BOARD_CHANGED_EVENT,
        payload,
      );
    }
  }

  async list(tenantId: string): Promise<KanbanBoardSummary[]> {
    const boards = await this.prisma.kanbanBoard.findMany({
      where: this.accessibleWhere(tenantId),
      include: { tenant: TENANT_REF_SELECT, partnerTenant: TENANT_REF_SELECT },
      orderBy: { createdAt: 'desc' },
    });
    if (boards.length === 0) return [];
    const groups = await this.prisma.kanbanCard.groupBy({
      by: ['boardId', 'column'],
      where: { boardId: { in: boards.map((board) => board.id) } },
      _count: { _all: true },
    });
    const countsByBoard = new Map<string, Record<KanbanColumn, number>>();
    for (const group of groups) {
      const counts = countsByBoard.get(group.boardId) ?? { ...EMPTY_COUNTS };
      counts[group.column] = group._count._all;
      countsByBoard.set(group.boardId, counts);
    }
    return boards.map((board) => ({
      id: board.id,
      name: board.name,
      isOwner: board.tenantId === tenantId,
      ownerTenant: board.tenant,
      partnerTenant: board.partnerTenant,
      cardCounts: countsByBoard.get(board.id) ?? { ...EMPTY_COUNTS },
      createdAt: board.createdAt,
    }));
  }

  private async assertValidPartner(
    tenantId: string,
    partnerTenantId: string,
  ): Promise<void> {
    if (partnerTenantId === tenantId) {
      throw new AppException(
        'KANBAN_PARTNER_SELF',
        'Kendi sirketinizi ortak olarak ekleyemezsiniz.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const partner = await this.prisma.tenant.findUnique({
      where: { id: partnerTenantId },
      select: { id: true },
    });
    if (!partner) {
      throw new AppException(
        'KANBAN_PARTNER_NOT_FOUND',
        'Bu sirket koduna sahip bir sirket bulunamadi.',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async create(
    tenantId: string,
    userId: string,
    dto: CreateKanbanBoardDto,
  ): Promise<KanbanBoardSummary> {
    if (dto.partnerTenantId) {
      await this.assertValidPartner(tenantId, dto.partnerTenantId);
    }
    const board = await this.prisma.kanbanBoard.create({
      data: {
        tenantId,
        partnerTenantId: dto.partnerTenantId ?? null,
        name: dto.name,
        createdById: userId,
      },
      include: { tenant: TENANT_REF_SELECT, partnerTenant: TENANT_REF_SELECT },
    });
    await this.audit.log({
      action: 'CREATE',
      entity: 'KanbanBoard',
      entityId: board.id,
      meta: { partnerTenantId: board.partnerTenantId },
    });
    this.emitChanged(board);
    return {
      id: board.id,
      name: board.name,
      isOwner: true,
      ownerTenant: board.tenant,
      partnerTenant: board.partnerTenant,
      cardCounts: { ...EMPTY_COUNTS },
      createdAt: board.createdAt,
    };
  }

  private async findOwned(id: string, tenantId: string): Promise<KanbanBoard> {
    const board = await this.findAccessible(id, tenantId);
    if (board.tenantId !== tenantId) {
      throw new AppException(
        'KANBAN_BOARD_OWNER_ONLY',
        'Bu islemi sadece panoyu olusturan sirket yapabilir.',
        HttpStatus.FORBIDDEN,
      );
    }
    return board;
  }

  async update(
    id: string,
    tenantId: string,
    dto: UpdateKanbanBoardDto,
  ): Promise<void> {
    // Isim degisikligi hem sahip hem ortak tenant'a acik (kullanici karari);
    // silme ise yalnizca sahipte (bkz. remove/findOwned).
    const board = await this.findAccessible(id, tenantId);
    const partnerChanged =
      dto.partnerTenantId !== undefined &&
      dto.partnerTenantId !== board.partnerTenantId;
    if (partnerChanged && dto.partnerTenantId) {
      await this.assertValidPartner(tenantId, dto.partnerTenantId);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.kanbanBoard.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(partnerChanged ? { partnerTenantId: dto.partnerTenantId } : {}),
        },
      });
      // Ortak kaldirilir/degisirse eski ortagin kullanicilarina atanmis kartlar
      // "atanmamis"a duser - erisemeyecekleri panoda sorumlu gorunmesinler.
      if (partnerChanged && board.partnerTenantId) {
        await tx.kanbanCard.updateMany({
          where: {
            boardId: id,
            assignee: { tenantId: board.partnerTenantId },
          },
          data: { assigneeUserId: null },
        });
      }
    });
    await this.audit.log({
      action: 'UPDATE',
      entity: 'KanbanBoard',
      entityId: id,
      ...(partnerChanged
        ? {
            meta: {
              previousPartnerTenantId: board.partnerTenantId,
              partnerTenantId: dto.partnerTenantId,
            },
          }
        : {}),
    });
    // Eski ortak da haberdar edilir (listesinden pano kaybolsun) + yeni durum.
    this.emitChanged(board);
    if (partnerChanged && dto.partnerTenantId) {
      this.emitChanged({ ...board, partnerTenantId: dto.partnerTenantId });
    }
  }

  async remove(id: string, tenantId: string): Promise<void> {
    const board = await this.findOwned(id, tenantId);
    await this.prisma.kanbanBoard.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.audit.log({
      action: 'DELETE',
      entity: 'KanbanBoard',
      entityId: id,
    });
    this.emitChanged(board);
  }
}
