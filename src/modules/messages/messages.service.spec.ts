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

function createMessageRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'message-1',
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

function createPrisma(messageRow: unknown = createMessageRow()) {
  const client = {
    message: {
      findFirst: vi.fn().mockResolvedValue(messageRow),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue(messageRow),
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
  it('getById: gonderen mesaji gorebilir', async () => {
    const prisma = createPrisma();
    const service = new MessagesService(
      prisma as never,
      fakeAudit,
      fakeRealtime,
    );
    await expect(
      service.getById('message-1', SENDER_ID),
    ).resolves.toMatchObject({ id: 'message-1' });
  });

  it('getById: TO alicisi mesaji gorebilir', async () => {
    const prisma = createPrisma();
    const service = new MessagesService(
      prisma as never,
      fakeAudit,
      fakeRealtime,
    );
    await expect(
      service.getById('message-1', RECIPIENT_ID),
    ).resolves.toMatchObject({ id: 'message-1' });
  });

  it('getById: ilgisiz kullanici NOT_FOUND alir', async () => {
    const prisma = createPrisma();
    const service = new MessagesService(
      prisma as never,
      fakeAudit,
      fakeRealtime,
    );
    await expect(
      service.getById('message-1', BYSTANDER_ID),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<AppException>);
  });

  it('getById: bulunamayan mesaj NOT_FOUND firlatir', async () => {
    const prisma = createPrisma(null);
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

  it('markRead: alici olmayan kullanici icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma();
    prisma.messageRecipient.updateMany.mockResolvedValue({ count: 0 });
    const service = new MessagesService(
      prisma as never,
      fakeAudit,
      fakeRealtime,
    );
    await expect(
      service.markRead('message-1', RECIPIENT_ID),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<AppException>);
  });

  it('markRead: alici mesaji okundu isaretler', async () => {
    const prisma = createPrisma();
    const service = new MessagesService(
      prisma as never,
      fakeAudit,
      fakeRealtime,
    );
    await service.markRead('message-1', RECIPIENT_ID);
    expect(prisma.messageRecipient.updateMany).toHaveBeenCalledWith({
      where: { messageId: 'message-1', userId: RECIPIENT_ID },
      data: { readAt: expect.any(Date) },
    });
  });
});
