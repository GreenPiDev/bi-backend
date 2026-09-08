import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { Message, MessageRecipient, Prisma } from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import { parseSort, type PagedResult } from '../../core/dto/list-query.dto';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { AuditService } from '../audit/audit.service';
import type { CreateMessageDto, MessageQueryDto } from './dto/message.dto';

const SORTABLE_FIELDS = ['sentAt', 'createdAt'] as const;

export type MessageWithRecipients = Message & {
  recipients: MessageRecipient[];
};

const MESSAGE_INCLUDE = {
  recipients: true,
} as const;

@Injectable()
export class MessagesService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
  ) {}

  async list(
    userId: string,
    query: MessageQueryDto,
  ): Promise<PagedResult<MessageWithRecipients>> {
    const { page, pageSize, box, relatedEntity, relatedEntityId, q } = query;
    const { field, direction } = parseSort(query.sort, SORTABLE_FIELDS, {
      field: 'sentAt',
      direction: 'desc',
    });

    const boxCondition: Prisma.MessageWhereInput =
      box === 'sent'
        ? { senderId: userId }
        : box === 'inbox'
          ? { recipients: { some: { userId } } }
          : {
              OR: [{ senderId: userId }, { recipients: { some: { userId } } }],
            };

    const where: Prisma.MessageWhereInput = {
      AND: [
        boxCondition,
        ...(relatedEntity ? [{ relatedEntity }] : []),
        ...(relatedEntityId ? [{ relatedEntityId }] : []),
        ...(q ? [{ body: { contains: q, mode: 'insensitive' as const } }] : []),
      ],
    };

    const [data, total] = await Promise.all([
      this.prisma.message.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { [field]: direction },
        include: MESSAGE_INCLUDE,
      }),
      this.prisma.message.count({ where }),
    ]);

    return {
      data,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async getById(id: string, userId: string): Promise<MessageWithRecipients> {
    const message = await this.prisma.message.findFirst({
      where: { id },
      include: MESSAGE_INCLUDE,
    });
    if (
      !message ||
      (message.senderId !== userId &&
        !message.recipients.some((recipient) => recipient.userId === userId))
    ) {
      throw new AppException(
        'NOT_FOUND',
        'Mesaj bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    return message;
  }

  async create(
    tenantId: string,
    senderId: string,
    dto: CreateMessageDto,
  ): Promise<MessageWithRecipients> {
    const created = await this.prisma.$transaction(async (tx) => {
      return tx.message.create({
        data: {
          tenantId,
          createdById: senderId,
          senderId,
          body: dto.body,
          relatedEntity: dto.relatedEntity,
          relatedEntityId: dto.relatedEntityId,
          recipients: {
            create: [
              ...dto.toUserIds.map((userId) => ({
                userId,
                kind: 'TO' as const,
              })),
              ...dto.ccUserIds.map((userId) => ({
                userId,
                kind: 'CC' as const,
              })),
            ],
          },
        },
        include: MESSAGE_INCLUDE,
      });
    });

    await this.audit.log({
      action: 'CREATE',
      entity: 'Message',
      entityId: created.id,
    });

    this.realtime.emitToTenant(tenantId, 'messages.message.created', {
      id: created.id,
      senderId: created.senderId,
      body: created.body.slice(0, 140),
      sentAt: created.sentAt,
      relatedEntity: created.relatedEntity,
      relatedEntityId: created.relatedEntityId,
      recipientUserIds: created.recipients.map((recipient) => recipient.userId),
    });

    return created;
  }

  async markRead(id: string, userId: string): Promise<void> {
    await this.getById(id, userId);
    const result = await this.prisma.messageRecipient.updateMany({
      where: { messageId: id, userId },
      data: { readAt: new Date() },
    });
    if (result.count === 0) {
      throw new AppException(
        'NOT_FOUND',
        'Mesaj bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
  }

  async listAssignableUsers(): Promise<{ id: string; name: string }[]> {
    return this.prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }
}
