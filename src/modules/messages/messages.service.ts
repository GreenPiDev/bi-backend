import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type {
  Message,
  MessageRecipient,
  MessageRelatedEntity,
  Prisma,
} from '@prisma/client';
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
const CONVERSATION_SCAN_LIMIT = 2000;

export type MessageWithRecipients = Message & {
  recipients: MessageRecipient[];
};

export interface ConversationSummary {
  conversationId: string;
  relatedEntity: MessageRelatedEntity | null;
  relatedEntityId: string | null;
  lastMessage: MessageWithRecipients;
  messageCount: number;
  unreadCount: number;
}

export interface ConversationDetail {
  conversationId: string;
  relatedEntity: MessageRelatedEntity | null;
  relatedEntityId: string | null;
  messages: MessageWithRecipients[];
}

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
  ): Promise<PagedResult<ConversationSummary>> {
    const { page, pageSize, box, relatedEntity, relatedEntityId, q } = query;
    const { direction } = parseSort(query.sort, SORTABLE_FIELDS, {
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

    // Konusma bazli gruplama Prisma'nin groupBy'iyla dogrudan yapilamaz (en son mesaj +
    // okunmamis sayisi gerekiyor); kucuk/orta olcek icin makul bir pencere cekilip
    // bellekte gruplaniyor - bkz. docs/VARSAYIMLAR.md mesaj hacmi notu.
    const candidates = await this.prisma.message.findMany({
      where,
      orderBy: { sentAt: direction },
      take: CONVERSATION_SCAN_LIMIT,
      include: MESSAGE_INCLUDE,
    });

    const byConversation = new Map<string, MessageWithRecipients[]>();
    for (const message of candidates) {
      const group = byConversation.get(message.conversationId);
      if (group) {
        group.push(message);
      } else {
        byConversation.set(message.conversationId, [message]);
      }
    }

    const summaries: ConversationSummary[] = Array.from(
      byConversation.entries(),
    ).map(([conversationId, messages]) => {
      const lastMessage = messages[0]!;
      const unreadCount = messages.reduce(
        (count, message) =>
          count +
          message.recipients.filter(
            (recipient) => recipient.userId === userId && !recipient.readAt,
          ).length,
        0,
      );
      return {
        conversationId,
        relatedEntity: lastMessage.relatedEntity,
        relatedEntityId: lastMessage.relatedEntityId,
        lastMessage,
        messageCount: messages.length,
        unreadCount,
      };
    });

    summaries.sort(
      (a, b) =>
        new Date(b.lastMessage.sentAt).getTime() -
        new Date(a.lastMessage.sentAt).getTime(),
    );

    const total = summaries.length;
    const start = (page - 1) * pageSize;
    const data = summaries.slice(start, start + pageSize);

    return {
      data,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  private async getVisibleConversationMessages(
    conversationId: string,
    userId: string,
  ): Promise<MessageWithRecipients[]> {
    const messages = await this.prisma.message.findMany({
      where: {
        conversationId,
        OR: [{ senderId: userId }, { recipients: { some: { userId } } }],
      },
      orderBy: { sentAt: 'asc' },
      include: MESSAGE_INCLUDE,
    });
    if (messages.length === 0) {
      throw new AppException(
        'NOT_FOUND',
        'Mesaj bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    return messages;
  }

  async getById(
    conversationId: string,
    userId: string,
  ): Promise<ConversationDetail> {
    const messages = await this.getVisibleConversationMessages(
      conversationId,
      userId,
    );
    const first = messages[0]!;
    return {
      conversationId,
      relatedEntity: first.relatedEntity,
      relatedEntityId: first.relatedEntityId,
      messages,
    };
  }

  async create(
    tenantId: string,
    senderId: string,
    dto: CreateMessageDto,
  ): Promise<MessageWithRecipients> {
    let relatedEntity = dto.relatedEntity;
    let relatedEntityId = dto.relatedEntityId;

    if (dto.conversationId) {
      // Yaniti mevcut konusmaya baglamadan once kullanicinin o konusmanin
      // gercek bir katilimcisi oldugunu dogrula (baskasinin conversationId'sini
      // tahmin ederek mesaj enjekte etmesin).
      const [existing] = await this.getVisibleConversationMessages(
        dto.conversationId,
        senderId,
      );
      relatedEntity = existing!.relatedEntity ?? undefined;
      relatedEntityId = existing!.relatedEntityId ?? undefined;
    }

    const created = await this.prisma.$transaction(async (tx) => {
      return tx.message.create({
        data: {
          tenantId,
          createdById: senderId,
          senderId,
          body: dto.body,
          relatedEntity,
          relatedEntityId,
          conversationId: dto.conversationId,
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
      conversationId: created.conversationId,
      senderId: created.senderId,
      body: created.body.slice(0, 140),
      sentAt: created.sentAt,
      relatedEntity: created.relatedEntity,
      relatedEntityId: created.relatedEntityId,
      recipientUserIds: created.recipients.map((recipient) => recipient.userId),
    });

    return created;
  }

  async markConversationRead(
    conversationId: string,
    userId: string,
  ): Promise<void> {
    const messages = await this.getVisibleConversationMessages(
      conversationId,
      userId,
    );
    await this.prisma.messageRecipient.updateMany({
      where: {
        messageId: { in: messages.map((message) => message.id) },
        userId,
        readAt: null,
      },
      data: { readAt: new Date() },
    });
  }

  async listAssignableUsers(): Promise<{ id: string; name: string }[]> {
    return this.prisma.user.findMany({
      where: { isActive: true, isPlatformAdmin: false },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }
}
