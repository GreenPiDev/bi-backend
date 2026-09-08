import { AppException } from '../../core/errors/app.exception';
import { MessagesService } from './messages.service';

const auditLog = vi.fn();
const fakeAudit = { log: auditLog } as never;

const emitToTenant = vi.fn();
const fakeRealtime = { emitToTenant } as never;

const TENANT_ID = 'tenant-1';
const SENDER_ID = '11111111-1111-1111-1111-111111111111';
const RECIPIENT_ID = '22222222-2222-2222-2222-222222222222';
const BYSTANDER_ID = '33333333-3333-3333-3333-333333333333';
const CONVERSATION_ID = 'conversation-1';

function createMessageRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'message-1',
    conversationId: CONVERSATION_ID,
    senderId: SENDER_ID,
    body: 'Merhaba',
    sentAt: new Date('2026-01-01'),
    relatedEntity: null,
    relatedEntityId: null,
    recipients: [
      { id: 'rec-1', userId: RECIPIENT_ID, kind: 'TO', readAt: null },
    ],
    ...overrides,
  };
}

function createPrisma(messageRows: unknown[] = [createMessageRow()]) {
  const client = {
    message: {
      findMany: vi.fn().mockResolvedValue(messageRows),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue(messageRows[0] ?? createMessageRow()),
    },
    messageRecipient: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    user: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(client)),
  };
  return client;
}

describe('MessagesService', () => {
  it('getById: gonderen konusmayi gorebilir', async () => {
    const prisma = createPrisma();
    const service = new MessagesService(
      prisma as never,
      fakeAudit,
      fakeRealtime,
    );
    await expect(
      service.getById(CONVERSATION_ID, SENDER_ID),
    ).resolves.toMatchObject({
      conversationId: CONVERSATION_ID,
      messages: [expect.objectContaining({ id: 'message-1' })],
    });
  });

  it('getById: TO alicisi konusmayi gorebilir', async () => {
    const prisma = createPrisma();
    const service = new MessagesService(
      prisma as never,
      fakeAudit,
      fakeRealtime,
    );
    await expect(
      service.getById(CONVERSATION_ID, RECIPIENT_ID),
    ).resolves.toMatchObject({ conversationId: CONVERSATION_ID });
  });

  it('getById: ilgisiz kullanici NOT_FOUND alir', async () => {
    // Ilgisiz kullanici icin tenant-scoped where filtresi (senderId/recipients)
    // hicbir satir dondurmez.
    const prisma = createPrisma([]);
    const service = new MessagesService(
      prisma as never,
      fakeAudit,
      fakeRealtime,
    );
    await expect(
      service.getById(CONVERSATION_ID, BYSTANDER_ID),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<AppException>);
  });

  it('getById: bulunamayan konusma NOT_FOUND firlatir', async () => {
    const prisma = createPrisma([]);
    const service = new MessagesService(
      prisma as never,
      fakeAudit,
      fakeRealtime,
    );
    await expect(service.getById('yok', SENDER_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<AppException>);
  });

  it('create: TO+CC nested recipients ile mesaj olusturur ve realtime yayinlar', async () => {
    const prisma = createPrisma();
    const service = new MessagesService(
      prisma as never,
      fakeAudit,
      fakeRealtime,
    );
    await service.create(TENANT_ID, SENDER_ID, {
      body: 'Merhaba',
      toUserIds: [RECIPIENT_ID],
      ccUserIds: [BYSTANDER_ID],
    } as never);

    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: TENANT_ID,
          senderId: SENDER_ID,
          conversationId: undefined,
          recipients: {
            create: [
              { userId: RECIPIENT_ID, kind: 'TO' },
              { userId: BYSTANDER_ID, kind: 'CC' },
            ],
          },
        }),
      }),
    );
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CREATE', entity: 'Message' }),
    );
    expect(emitToTenant).toHaveBeenCalledWith(
      TENANT_ID,
      'messages.message.created',
      expect.objectContaining({ id: 'message-1', senderId: SENDER_ID }),
    );
  });

  it('create: conversationId verilince katilimci dogrulamasi yapip ayni konusmaya ekler', async () => {
    const prisma = createPrisma();
    const service = new MessagesService(
      prisma as never,
      fakeAudit,
      fakeRealtime,
    );
    await service.create(TENANT_ID, RECIPIENT_ID, {
      body: 'Cevap',
      toUserIds: [SENDER_ID],
      ccUserIds: [],
      conversationId: CONVERSATION_ID,
    } as never);

    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          conversationId: CONVERSATION_ID,
        }),
      }),
    );
  });

  it('create: katilimcisi olmadigi konusmaya yanit atmaya calisan NOT_FOUND alir', async () => {
    const prisma = createPrisma([]);
    const service = new MessagesService(
      prisma as never,
      fakeAudit,
      fakeRealtime,
    );
    await expect(
      service.create(TENANT_ID, BYSTANDER_ID, {
        body: 'Cevap',
        toUserIds: [SENDER_ID],
        ccUserIds: [],
        conversationId: CONVERSATION_ID,
      } as never),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<AppException>);
  });

  it('markConversationRead: ilgisiz kullanici icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma([]);
    const service = new MessagesService(
      prisma as never,
      fakeAudit,
      fakeRealtime,
    );
    await expect(
      service.markConversationRead(CONVERSATION_ID, BYSTANDER_ID),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<AppException>);
  });

  it('markConversationRead: alici konusmadaki okunmamis mesajlari okundu isaretler', async () => {
    const prisma = createPrisma();
    const service = new MessagesService(
      prisma as never,
      fakeAudit,
      fakeRealtime,
    );
    await service.markConversationRead(CONVERSATION_ID, RECIPIENT_ID);
    expect(prisma.messageRecipient.updateMany).toHaveBeenCalledWith({
      where: {
        messageId: { in: ['message-1'] },
        userId: RECIPIENT_ID,
        readAt: null,
      },
      data: { readAt: expect.any(Date) },
    });
  });
});
