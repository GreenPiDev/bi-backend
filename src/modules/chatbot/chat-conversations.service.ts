import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { ChatMessageRole } from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import type { ChatHistoryItem } from './dto/chat-message.dto';

const TITLE_MAX_LENGTH = 60;
const HISTORY_WINDOW = 20;

export interface ChatConversationSummary {
  id: string;
  title: string | null;
  updatedAt: Date;
}

export interface ChatConversationDetail {
  id: string;
  title: string | null;
  messages: ChatHistoryItem[];
}

const ROLE_TO_DB: Record<ChatHistoryItem['role'], ChatMessageRole> = {
  user: 'USER',
  assistant: 'ASSISTANT',
};
const ROLE_FROM_DB: Record<ChatMessageRole, ChatHistoryItem['role']> = {
  USER: 'user',
  ASSISTANT: 'assistant',
};

/**
 * Kullanıcı başına çoklu, kalıcı chatbot konuşması (bkz. docs/VARSAYIMLAR.md V77) -
 * önceki tarayıcı sessionStorage deseninin (chatbot-storage.ts, kaldırıldı) yerini
 * aldı. Her konuşma `userId` ile süzülür - aynı tenant'taki başka bir kullanıcı bir
 * konuşmanın id'sini bilse bile göremez (sohbet kişiseldir, tenant-geneli bir CRM
 * kaydı değil).
 */
@Injectable()
export class ChatConversationsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
  ) {}

  async list(userId: string): Promise<ChatConversationSummary[]> {
    return this.prisma.chatConversation.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, title: true, updatedAt: true },
    });
  }

  async create(userId: string): Promise<ChatConversationSummary> {
    return this.prisma.chatConversation.create({
      // tenantId, tenant-scoped extension tarafindan calisma zamaninda eklenir
      data: { userId } as never,
      select: { id: true, title: true, updatedAt: true },
    });
  }

  async getById(id: string, userId: string): Promise<ChatConversationDetail> {
    const conversation = await this.requireOwnConversation(id, userId);
    const messages = await this.prisma.chatMessage.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: 'asc' },
    });
    return {
      id: conversation.id,
      title: conversation.title,
      messages: messages.map((m) => ({
        role: ROLE_FROM_DB[m.role],
        content: m.content,
      })),
    };
  }

  async remove(id: string, userId: string): Promise<void> {
    await this.requireOwnConversation(id, userId);
    await this.prisma.chatMessage.deleteMany({ where: { conversationId: id } });
    await this.prisma.chatConversation.delete({ where: { id } });
  }

  /**
   * `ChatbotService.chat`'in ihtiyaç duyduğu tüm okuma/yazma - sahiplik kontrolü +
   * OpenAI'a geçilecek pencere (son `HISTORY_WINDOW` mesaj) + başlık ataması bir
   * arada, iki ayrı round-trip yerine.
   */
  async loadForChat(
    id: string,
    userId: string,
  ): Promise<{ title: string | null; history: ChatHistoryItem[] }> {
    const conversation = await this.requireOwnConversation(id, userId);
    const messages = await this.prisma.chatMessage.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_WINDOW,
    });
    return {
      title: conversation.title,
      history: messages
        .reverse()
        .map((m) => ({ role: ROLE_FROM_DB[m.role], content: m.content })),
    };
  }

  /**
   * Kullanıcı mesajı + asistan yanıtını kaydeder, `updatedAt`'i günceller ve
   * (henüz başlıksızsa) ilk kullanıcı mesajından kısaltılmış bir başlık atar.
   * Döndürülen `title`, sadece bu çağrıda İLK KEZ atandıysa (frontend'in listeyi
   * yeniden sorgulamadan güncelleyebilmesi için) dolu - aksi halde null.
   */
  async appendExchange(
    id: string,
    userMessage: string,
    assistantReply: string,
  ): Promise<{ assignedTitle: string | null }> {
    // findUnique/findUniqueOrThrow tenant-scoped modellerde bilerek kullanilmaz
    // (bkz. tenant-scoped.extension.ts doc comment'i - tenantId'yi otomatik
    // enjekte etmiyor) - findFirst kullanilir. Cagiran (ChatbotService.chat)
    // bu noktadan once zaten loadForChat ile sahiplik kontrolu yapmis oluyor.
    const conversation = await this.prisma.chatConversation.findFirst({
      where: { id },
    });
    if (!conversation) {
      throw new AppException(
        'CHAT_CONVERSATION_NOT_FOUND',
        'Konuşma bulunamadı.',
        HttpStatus.NOT_FOUND,
      );
    }
    const assignedTitle = conversation.title
      ? null
      : this.makeTitle(userMessage);

    await this.prisma.chatMessage.createMany({
      data: [
        { conversationId: id, role: ROLE_TO_DB.user, content: userMessage },
        {
          conversationId: id,
          role: ROLE_TO_DB.assistant,
          content: assistantReply,
        },
      ],
    });
    await this.prisma.chatConversation.update({
      where: { id },
      data: {
        updatedAt: new Date(),
        ...(assignedTitle ? { title: assignedTitle } : {}),
      },
    });

    return { assignedTitle };
  }

  private makeTitle(message: string): string {
    const trimmed = message.trim();
    if (trimmed.length <= TITLE_MAX_LENGTH) return trimmed;
    return `${trimmed.slice(0, TITLE_MAX_LENGTH).trimEnd()}…`;
  }

  private async requireOwnConversation(id: string, userId: string) {
    const conversation = await this.prisma.chatConversation.findFirst({
      where: { id, userId },
    });
    if (!conversation) {
      throw new AppException(
        'CHAT_CONVERSATION_NOT_FOUND',
        'Konuşma bulunamadı.',
        HttpStatus.NOT_FOUND,
      );
    }
    return conversation;
  }
}
