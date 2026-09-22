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
import { FileUrlService } from '../../core/storage/file-url.service';
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
  /** Iliskili kaydin gorunur adi (Quote.quoteNumber, Project.name, Interaction icin
   * bagli carinin adi) - widget/liste satirinda sadece tur degil, hangi kayit oldugu
   * da gorunsun diye. Kayit silinmisse/bulunamazsa null. */
  relatedEntityLabel: string | null;
  lastMessage: MessageWithRecipients;
  messageCount: number;
  unreadCount: number;
  starred: boolean;
}

export interface ConversationDetail {
  conversationId: string;
  relatedEntity: MessageRelatedEntity | null;
  relatedEntityId: string | null;
  relatedEntityLabel: string | null;
  messages: MessageWithRecipients[];
  starred: boolean;
}

interface RelatedEntityRef {
  relatedEntity: MessageRelatedEntity | null;
  relatedEntityId: string | null;
  relatedEntityLabel: string | null;
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
    private readonly fileUrl: FileUrlService,
  ) {}

  async list(
    userId: string,
    query: MessageQueryDto,
  ): Promise<PagedResult<ConversationSummary>> {
    const {
      page,
      pageSize,
      box,
      relatedEntity,
      quoteIds,
      projectIds,
      interactionIds,
      q,
      recipientUserId,
    } = query;
    const { direction } = parseSort(query.sort, SORTABLE_FIELDS, {
      field: 'sentAt',
      direction: 'desc',
    });

    // q ayni zamanda kisiye gore de arar: gonderen/alici adi eslesirse o
    // konusma da sonuca girer (subject/body'ye ek olarak, tek bir OR icinde).
    const matchedUserIds = q
      ? (
          await this.prisma.user.findMany({
            where: { name: { contains: q, mode: 'insensitive' } },
            select: { id: true },
          })
        ).map((user) => user.id)
      : [];

    const boxCondition: Prisma.MessageWhereInput =
      box === 'sent'
        ? { senderId: userId }
        : box === 'inbox'
          ? { recipients: { some: { userId } } }
          : {
              OR: [{ senderId: userId }, { recipients: { some: { userId } } }],
            };

    // Kompozit ilgili-kayit filtresi: belirli kayitlar (quoteIds/projectIds/
    // interactionIds) secilirse o tur icin filtre sadece o kayitlarla sinirlanir;
    // relatedEntity'de secili olup kendi kayit listesi bos olan turler icin ise
    // genel tur filtresi (o turdeki TUM mesajlar) uygulanir. Ikisi birbirini
    // dislamaz, sonuc OR ile birlestirilir (bkz. CLAUDE.md ilgili sohbet karari).
    const remainingTypes = new Set(relatedEntity ?? []);
    const relatedEntityConditions: Prisma.MessageWhereInput[] = [];
    if (quoteIds?.length) {
      relatedEntityConditions.push({
        relatedEntity: 'QUOTE',
        relatedEntityId: { in: quoteIds },
      });
      remainingTypes.delete('QUOTE');
    }
    if (projectIds?.length) {
      relatedEntityConditions.push({
        relatedEntity: 'PROJECT',
        relatedEntityId: { in: projectIds },
      });
      remainingTypes.delete('PROJECT');
    }
    if (interactionIds?.length) {
      relatedEntityConditions.push({
        relatedEntity: 'INTERACTION',
        relatedEntityId: { in: interactionIds },
      });
      remainingTypes.delete('INTERACTION');
    }
    if (remainingTypes.size > 0) {
      relatedEntityConditions.push({
        relatedEntity: { in: Array.from(remainingTypes) },
      });
    }

    const where: Prisma.MessageWhereInput = {
      AND: [
        boxCondition,
        ...(relatedEntityConditions.length
          ? [{ OR: relatedEntityConditions }]
          : []),
        ...(recipientUserId
          ? [{ recipients: { some: { userId: recipientUserId } } }]
          : []),
        ...(q
          ? [
              {
                OR: [
                  { subject: { contains: q, mode: 'insensitive' as const } },
                  { body: { contains: q, mode: 'insensitive' as const } },
                  ...(matchedUserIds.length
                    ? [
                        { senderId: { in: matchedUserIds } },
                        {
                          recipients: {
                            some: { userId: { in: matchedUserIds } },
                          },
                        },
                      ]
                    : []),
                ],
              },
            ]
          : []),
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
        // Asagida sadece sayfalanmis dilim icin dolduruluyor - tum taranan
        // konusmalar icin yildiz/etiket sorgusu atmak gereksiz (bkz. asagidaki dongüler).
        relatedEntityLabel: null,
        lastMessage,
        messageCount: messages.length,
        unreadCount,
        starred: false,
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

    const starredConversationIds = new Set(
      (
        await this.prisma.messageStar.findMany({
          where: {
            userId,
            conversationId: {
              in: data.map((summary) => summary.conversationId),
            },
          },
          select: { conversationId: true },
        })
      ).map((row) => row.conversationId),
    );
    for (const summary of data) {
      summary.starred = starredConversationIds.has(summary.conversationId);
    }

    await this.attachRelatedEntityLabels(data);

    return {
      data,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  /** Verilen konusma(lar) icin `relatedEntityLabel`'i doldurur - Quote icin numara,
   * Project icin ad, Interaction icin bagli carinin adi (kendi adi yok). Hem liste
   * (`list`, sayfalanmis dilim) hem tekil konusma (`getById`) tarafindan paylasilir;
   * kayit turu basina tek toplu sorgu, N+1 yok. */
  private async attachRelatedEntityLabels(
    refs: RelatedEntityRef[],
  ): Promise<void> {
    const quoteIds = refs
      .filter((r) => r.relatedEntity === 'QUOTE' && r.relatedEntityId)
      .map((r) => r.relatedEntityId!);
    const projectIds = refs
      .filter((r) => r.relatedEntity === 'PROJECT' && r.relatedEntityId)
      .map((r) => r.relatedEntityId!);
    const interactionIds = refs
      .filter((r) => r.relatedEntity === 'INTERACTION' && r.relatedEntityId)
      .map((r) => r.relatedEntityId!);

    if (!quoteIds.length && !projectIds.length && !interactionIds.length) {
      return;
    }

    const [quotes, projects, interactions] = await Promise.all([
      quoteIds.length
        ? this.prisma.quote.findMany({
            where: { id: { in: quoteIds } },
            select: { id: true, quoteNumber: true },
          })
        : [],
      projectIds.length
        ? this.prisma.project.findMany({
            where: { id: { in: projectIds } },
            select: { id: true, name: true },
          })
        : [],
      interactionIds.length
        ? this.prisma.interaction.findMany({
            where: { id: { in: interactionIds } },
            select: { id: true, account: { select: { name: true } } },
          })
        : [],
    ]);

    const labelById = new Map<string, string>();
    for (const quote of quotes) labelById.set(quote.id, quote.quoteNumber);
    for (const project of projects) labelById.set(project.id, project.name);
    for (const interaction of interactions) {
      if (interaction.account?.name) {
        labelById.set(interaction.id, interaction.account.name);
      }
    }

    for (const ref of refs) {
      ref.relatedEntityLabel = ref.relatedEntityId
        ? (labelById.get(ref.relatedEntityId) ?? null)
        : null;
    }
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
    const star = await this.prisma.messageStar.findFirst({
      where: { userId, conversationId },
    });
    const detail: ConversationDetail = {
      conversationId,
      relatedEntity: first.relatedEntity,
      relatedEntityId: first.relatedEntityId,
      relatedEntityLabel: null,
      messages,
      starred: Boolean(star),
    };
    await this.attachRelatedEntityLabels([detail]);
    return detail;
  }

  async create(
    tenantId: string,
    senderId: string,
    dto: CreateMessageDto,
  ): Promise<MessageWithRecipients> {
    let relatedEntity = dto.relatedEntity;
    let relatedEntityId = dto.relatedEntityId;
    let subject = dto.subject;

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
      // Konu, konusmanin ilk mesajindan miras alinir - yaniti yazarken
      // kullaniciya ayrica konu sorulmaz (bkz. CreateMessageSchema refine).
      subject = existing!.subject;
    }

    const created = await this.prisma.$transaction(async (tx) => {
      return tx.message.create({
        data: {
          tenantId,
          createdById: senderId,
          senderId,
          subject: subject!,
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
      subject: created.subject,
      body: created.body.slice(0, 140),
      sentAt: created.sentAt,
      relatedEntity: created.relatedEntity,
      relatedEntityId: created.relatedEntityId,
      recipientUserIds: created.recipients.map((recipient) => recipient.userId),
    });

    return created;
  }

  /** `read=true` (varsayilan): konusmadaki tum okunmamis mesajlari okundu isaretler.
   * `read=false`: manuel "okunmadi yap" - tum okunmus mesajlari tekrar okunmadi yapar. */
  async setConversationRead(
    conversationId: string,
    userId: string,
    read = true,
  ): Promise<void> {
    const messages = await this.getVisibleConversationMessages(
      conversationId,
      userId,
    );
    await this.prisma.messageRecipient.updateMany({
      where: {
        messageId: { in: messages.map((message) => message.id) },
        userId,
        readAt: read ? null : { not: null },
      },
      data: { readAt: read ? new Date() : null },
    });
  }

  /** Kisisel yildizlama - konusma bazli (bkz. MessageStar model yorumu). Once
   * kullanicinin bu konusmayi gorebildigi (gonderen/alici oldugu) dogrulanir. */
  async setConversationStar(
    conversationId: string,
    userId: string,
    tenantId: string,
    starred: boolean,
  ): Promise<void> {
    await this.getVisibleConversationMessages(conversationId, userId);

    if (starred) {
      const existing = await this.prisma.messageStar.findFirst({
        where: { userId, conversationId },
      });
      if (!existing) {
        await this.prisma.messageStar.create({
          data: { tenantId, userId, conversationId },
        });
      }
    } else {
      await this.prisma.messageStar.deleteMany({
        where: { userId, conversationId },
      });
    }
  }

  async listAssignableUsers(): Promise<
    { id: string; name: string; avatarUrl: string | null }[]
  > {
    const users = await this.prisma.user.findMany({
      where: { isActive: true, isPlatformAdmin: false },
      select: { id: true, name: true, avatarKey: true, updatedAt: true },
      orderBy: { name: 'asc' },
    });
    return users.map((user) => ({
      id: user.id,
      name: user.name,
      avatarUrl: this.fileUrl.build(user.avatarKey, user.updatedAt),
    }));
  }
}
