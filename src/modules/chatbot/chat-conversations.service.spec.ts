import { AppException } from '../../core/errors/app.exception';
import { ChatConversationsService } from './chat-conversations.service';

const USER_ID = 'u1';
const OTHER_USER_ID = 'u2';
const CONVERSATION_ID = 'c1';

function createPrisma(
  overrides: {
    conversation?: { id: string; userId: string; title: string | null } | null;
    messages?: { id: string; role: 'USER' | 'ASSISTANT'; content: string }[];
  } = {},
) {
  const conversation =
    overrides.conversation === undefined
      ? { id: CONVERSATION_ID, userId: USER_ID, title: null }
      : overrides.conversation;
  return {
    chatConversation: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({
        id: 'new-id',
        title: null,
        updatedAt: new Date(),
      }),
      findFirst: vi
        .fn()
        .mockImplementation(
          ({ where }: { where: { id: string; userId?: string } }) => {
            if (!conversation || conversation.id !== where.id)
              return Promise.resolve(null);
            if (
              where.userId !== undefined &&
              where.userId !== conversation.userId
            )
              return Promise.resolve(null);
            return Promise.resolve(conversation);
          },
        ),
      delete: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
    chatMessage: {
      findMany: vi.fn().mockResolvedValue(overrides.messages ?? []),
      createMany: vi.fn().mockResolvedValue({ count: 2 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
}

describe('ChatConversationsService', () => {
  it('getById: baska kullanicinin konusmasina 404 doner', async () => {
    const prisma = createPrisma({
      conversation: { id: CONVERSATION_ID, userId: OTHER_USER_ID, title: null },
    });
    const service = new ChatConversationsService(prisma as never);

    await expect(service.getById(CONVERSATION_ID, USER_ID)).rejects.toThrow(
      AppException,
    );
  });

  it('getById: olmayan konusmaya 404 doner', async () => {
    const prisma = createPrisma({ conversation: null });
    const service = new ChatConversationsService(prisma as never);

    await expect(service.getById('yok', USER_ID)).rejects.toThrow(AppException);
  });

  it('getById: kendi konusmasi icin mesajlari role eslemesiyle doner', async () => {
    const prisma = createPrisma({
      messages: [
        { id: 'm1', role: 'USER', content: 'merhaba' },
        {
          id: 'm2',
          role: 'ASSISTANT',
          content: 'merhaba, size nasil yardimci olabilirim',
        },
      ],
    });
    const service = new ChatConversationsService(prisma as never);

    const result = await service.getById(CONVERSATION_ID, USER_ID);

    expect(result.messages).toEqual([
      { role: 'user', content: 'merhaba' },
      { role: 'assistant', content: 'merhaba, size nasil yardimci olabilirim' },
    ]);
  });

  it('appendExchange: baslik yoksa ilk kullanici mesajindan kisaltilmis baslik atar', async () => {
    const prisma = createPrisma({
      conversation: { id: CONVERSATION_ID, userId: USER_ID, title: null },
    });
    const service = new ChatConversationsService(prisma as never);

    const result = await service.appendExchange(
      CONVERSATION_ID,
      'Onaylanan teklif sayisi nedir?',
      'Toplam 9 teklif onaylandi.',
    );

    expect(result.assignedTitle).toBe('Onaylanan teklif sayisi nedir?');
    expect(prisma.chatConversation.update).toHaveBeenCalledWith({
      where: { id: CONVERSATION_ID },
      data: expect.objectContaining({
        title: 'Onaylanan teklif sayisi nedir?',
      }),
    });
  });

  it('appendExchange: baslik zaten varsa tekrar atanmaz', async () => {
    const prisma = createPrisma({
      conversation: {
        id: CONVERSATION_ID,
        userId: USER_ID,
        title: 'Mevcut Baslik',
      },
    });
    const service = new ChatConversationsService(prisma as never);

    const result = await service.appendExchange(
      CONVERSATION_ID,
      'ikinci mesaj',
      'ikinci yanit',
    );

    expect(result.assignedTitle).toBeNull();
    const updateArg = prisma.chatConversation.update.mock.calls[0]![0] as {
      data: Record<string, unknown>;
    };
    expect(updateArg.data.title).toBeUndefined();
  });

  it('appendExchange: 60 karakterden uzun mesajlar uc-uc-uc ile kisaltilir', async () => {
    const prisma = createPrisma({
      conversation: { id: CONVERSATION_ID, userId: USER_ID, title: null },
    });
    const service = new ChatConversationsService(prisma as never);
    const longMessage = 'a'.repeat(80);

    const result = await service.appendExchange(
      CONVERSATION_ID,
      longMessage,
      'yanit',
    );

    expect(result.assignedTitle).toHaveLength(61);
    expect(result.assignedTitle?.endsWith('…')).toBe(true);
  });

  it('remove: baska kullanicinin konusmasini silemez', async () => {
    const prisma = createPrisma({
      conversation: { id: CONVERSATION_ID, userId: OTHER_USER_ID, title: null },
    });
    const service = new ChatConversationsService(prisma as never);

    await expect(service.remove(CONVERSATION_ID, USER_ID)).rejects.toThrow(
      AppException,
    );
    expect(prisma.chatConversation.delete).not.toHaveBeenCalled();
  });

  it('remove: kendi konusmasini mesajlariyla birlikte siler', async () => {
    const prisma = createPrisma();
    const service = new ChatConversationsService(prisma as never);

    await service.remove(CONVERSATION_ID, USER_ID);

    expect(prisma.chatMessage.deleteMany).toHaveBeenCalledWith({
      where: { conversationId: CONVERSATION_ID },
    });
    expect(prisma.chatConversation.delete).toHaveBeenCalledWith({
      where: { id: CONVERSATION_ID },
    });
  });
});
