import { AppException } from '../../core/errors/app.exception';
import { MessagesService } from './messages.service';

const auditLog = vi.fn();
const fakeAudit = { log: auditLog } as never;

const emitToTenant = vi.fn();
const fakeRealtime = { emitToTenant } as never;
const fakeFileUrl = { build: vi.fn(() => null) } as never;
const fakeStorage = {
  upload: vi.fn(),
  delete: vi.fn(),
  download: vi.fn(),
} as never;
const fakeMessagesCache = {
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn(),
  invalidate: vi.fn(),
} as never;

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
    subject: 'Konu',
    body: 'Merhaba',
    sentAt: new Date('2026-01-01'),
    relatedEntity: null,
    relatedEntityId: null,
    recipients: [
      { id: 'rec-1', userId: RECIPIENT_ID, kind: 'TO', readAt: null },
    ],
    attachments: [],
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
    messageStar: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    user: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    quote: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    project: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    interaction: {
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
      fakeFileUrl,
      fakeStorage,
      fakeMessagesCache,
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
      fakeFileUrl,
      fakeStorage,
      fakeMessagesCache,
    );
    await expect(
      service.getById(CONVERSATION_ID, RECIPIENT_ID),
    ).resolves.toMatchObject({ conversationId: CONVERSATION_ID });
  });

  it('getById: iliskili PROJECT icin relatedEntityLabel proje adini doldurur', async () => {
    const prisma = createPrisma([
      createMessageRow({
        relatedEntity: 'PROJECT',
        relatedEntityId: 'project-1',
      }),
    ]);
    prisma.project.findMany.mockResolvedValue([
      { id: 'project-1', name: 'Depo Yenileme' },
    ]);
    const service = new MessagesService(
      prisma as never,
      fakeAudit,
      fakeRealtime,
      fakeFileUrl,
      fakeStorage,
      fakeMessagesCache,
    );
    await expect(
      service.getById(CONVERSATION_ID, SENDER_ID),
    ).resolves.toMatchObject({ relatedEntityLabel: 'Depo Yenileme' });
  });

  it('getById: ilgisiz kullanici NOT_FOUND alir', async () => {
    // Ilgisiz kullanici icin tenant-scoped where filtresi (senderId/recipients)
    // hicbir satir dondurmez.
    const prisma = createPrisma([]);
    const service = new MessagesService(
      prisma as never,
      fakeAudit,
      fakeRealtime,
      fakeFileUrl,
      fakeStorage,
      fakeMessagesCache,
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
      fakeFileUrl,
      fakeStorage,
      fakeMessagesCache,
    );
    await expect(service.getById('yok', SENDER_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<AppException>);
  });

  it('list: recipientUserId verilince where kosuluna alici filtresi ekler', async () => {
    const prisma = createPrisma();
    const service = new MessagesService(
      prisma as never,
      fakeAudit,
      fakeRealtime,
      fakeFileUrl,
      fakeStorage,
      fakeMessagesCache,
    );
    await service.list(SENDER_ID, {
      page: 1,
      pageSize: 25,
      recipientUserId: RECIPIENT_ID,
    } as never);

    expect(prisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            { recipients: { some: { userId: RECIPIENT_ID } } },
          ]),
        }),
      }),
    );
  });

  it('list: q kisi adiyla eslesirse eslesen kullanicilarin gonderen/alici oldugu mesajlari da kapsar', async () => {
    const prisma = createPrisma();
    prisma.user.findMany.mockResolvedValue([{ id: RECIPIENT_ID }]);
    const service = new MessagesService(
      prisma as never,
      fakeAudit,
      fakeRealtime,
      fakeFileUrl,
      fakeStorage,
      fakeMessagesCache,
    );
    await service.list(SENDER_ID, {
      page: 1,
      pageSize: 25,
      q: 'Ahmet',
    } as never);

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { name: { contains: 'Ahmet', mode: 'insensitive' } },
      }),
    );
    expect(prisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({
              OR: expect.arrayContaining([
                { senderId: { in: [RECIPIENT_ID] } },
                { recipients: { some: { userId: { in: [RECIPIENT_ID] } } } },
              ]),
            }),
          ]),
        }),
      }),
    );
  });

  it('list: q eslesen kullanici yoksa sadece subject/body OR kosulunu kullanir', async () => {
    const prisma = createPrisma();
    const service = new MessagesService(
      prisma as never,
      fakeAudit,
      fakeRealtime,
      fakeFileUrl,
      fakeStorage,
      fakeMessagesCache,
    );
    await service.list(SENDER_ID, {
      page: 1,
      pageSize: 25,
      q: 'fatura',
    } as never);

    expect(prisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            {
              OR: [
                { subject: { contains: 'fatura', mode: 'insensitive' } },
                { body: { contains: 'fatura', mode: 'insensitive' } },
              ],
            },
          ]),
        }),
      }),
    );
  });

  it('list: relatedEntity QUOTE ise relatedEntityLabel quoteNumber olur', async () => {
    const prisma = createPrisma([
      createMessageRow({ relatedEntity: 'QUOTE', relatedEntityId: 'quote-1' }),
    ]);
    prisma.quote.findMany.mockResolvedValue([
      { id: 'quote-1', quoteNumber: 'TEK-2026-01-01-001' },
    ]);
    const service = new MessagesService(
      prisma as never,
      fakeAudit,
      fakeRealtime,
      fakeFileUrl,
      fakeStorage,
      fakeMessagesCache,
    );

    const result = await service.list(SENDER_ID, {
      page: 1,
      pageSize: 25,
    } as never);

    expect(prisma.quote.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['quote-1'] } } }),
    );
    expect(result.data[0]).toMatchObject({
      relatedEntityLabel: 'TEK-2026-01-01-001',
    });
  });

  it('list: relatedEntity PROJECT ise relatedEntityLabel proje adi olur', async () => {
    const prisma = createPrisma([
      createMessageRow({
        relatedEntity: 'PROJECT',
        relatedEntityId: 'project-1',
      }),
    ]);
    prisma.project.findMany.mockResolvedValue([
      { id: 'project-1', name: 'Depo Yenileme' },
    ]);
    const service = new MessagesService(
      prisma as never,
      fakeAudit,
      fakeRealtime,
      fakeFileUrl,
      fakeStorage,
      fakeMessagesCache,
    );

    const result = await service.list(SENDER_ID, {
      page: 1,
      pageSize: 25,
    } as never);

    expect(result.data[0]).toMatchObject({
      relatedEntityLabel: 'Depo Yenileme',
    });
  });

  it('list: relatedEntity INTERACTION ise relatedEntityLabel bagli carinin adi olur', async () => {
    const prisma = createPrisma([
      createMessageRow({
        relatedEntity: 'INTERACTION',
        relatedEntityId: 'interaction-1',
      }),
    ]);
    prisma.interaction.findMany.mockResolvedValue([
      { id: 'interaction-1', account: { name: 'ABC Ticaret' } },
    ]);
    const service = new MessagesService(
      prisma as never,
      fakeAudit,
      fakeRealtime,
      fakeFileUrl,
      fakeStorage,
      fakeMessagesCache,
    );

    const result = await service.list(SENDER_ID, {
      page: 1,
      pageSize: 25,
    } as never);

    expect(result.data[0]).toMatchObject({ relatedEntityLabel: 'ABC Ticaret' });
  });

  it('list: iliskili kayit yoksa relatedEntityLabel null kalir ve ekstra sorgu atilmaz', async () => {
    const prisma = createPrisma();
    const service = new MessagesService(
      prisma as never,
      fakeAudit,
      fakeRealtime,
      fakeFileUrl,
      fakeStorage,
      fakeMessagesCache,
    );

    const result = await service.list(SENDER_ID, {
      page: 1,
      pageSize: 25,
    } as never);

    expect(prisma.quote.findMany).not.toHaveBeenCalled();
    expect(prisma.project.findMany).not.toHaveBeenCalled();
    expect(prisma.interaction.findMany).not.toHaveBeenCalled();
    expect(result.data[0]).toMatchObject({ relatedEntityLabel: null });
  });

  it('list: sadece relatedEntity turu verilince o turdeki TUM mesajlari kapsayan genel filtre uygular', async () => {
    const prisma = createPrisma();
    const service = new MessagesService(
      prisma as never,
      fakeAudit,
      fakeRealtime,
      fakeFileUrl,
      fakeStorage,
      fakeMessagesCache,
    );
    await service.list(SENDER_ID, {
      page: 1,
      pageSize: 25,
      relatedEntity: ['QUOTE', 'PROJECT'],
    } as never);

    expect(prisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            { OR: [{ relatedEntity: { in: ['QUOTE', 'PROJECT'] } }] },
          ]),
        }),
      }),
    );
  });

  it('list: quoteIds+projectIds verilince o turler icin sadece secili kayitlarla sinirlar', async () => {
    const prisma = createPrisma();
    const service = new MessagesService(
      prisma as never,
      fakeAudit,
      fakeRealtime,
      fakeFileUrl,
      fakeStorage,
      fakeMessagesCache,
    );
    await service.list(SENDER_ID, {
      page: 1,
      pageSize: 25,
      relatedEntity: ['QUOTE', 'PROJECT'],
      quoteIds: ['quote-1', 'quote-2'],
      projectIds: ['project-1'],
    } as never);

    expect(prisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            {
              OR: [
                {
                  relatedEntity: 'QUOTE',
                  relatedEntityId: { in: ['quote-1', 'quote-2'] },
                },
                {
                  relatedEntity: 'PROJECT',
                  relatedEntityId: { in: ['project-1'] },
                },
              ],
            },
          ]),
        }),
      }),
    );
  });

  it('list: relatedEntity turu secilmese bile belirli quoteIds ile filtreleyebilir', async () => {
    const prisma = createPrisma();
    const service = new MessagesService(
      prisma as never,
      fakeAudit,
      fakeRealtime,
      fakeFileUrl,
      fakeStorage,
      fakeMessagesCache,
    );
    await service.list(SENDER_ID, {
      page: 1,
      pageSize: 25,
      quoteIds: ['quote-1'],
    } as never);

    expect(prisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            {
              OR: [
                {
                  relatedEntity: 'QUOTE',
                  relatedEntityId: { in: ['quote-1'] },
                },
              ],
            },
          ]),
        }),
      }),
    );
  });

  it('create: TO+CC nested recipients ile mesaj olusturur ve realtime yayinlar', async () => {
    const prisma = createPrisma();
    const service = new MessagesService(
      prisma as never,
      fakeAudit,
      fakeRealtime,
      fakeFileUrl,
      fakeStorage,
      fakeMessagesCache,
    );
    await service.create(TENANT_ID, SENDER_ID, {
      subject: 'Konu',
      body: 'Merhaba',
      toUserIds: [RECIPIENT_ID],
      ccUserIds: [BYSTANDER_ID],
    } as never);

    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: TENANT_ID,
          senderId: SENDER_ID,
          subject: 'Konu',
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

  it('create: attachments verilince nested create ile tenantId ekleyip fileUrl.build ile url uretir', async () => {
    const prisma = createPrisma([
      createMessageRow({
        attachments: [
          {
            id: 'att-1',
            fileKey: `PILENS/development/${TENANT_ID}/messages/x.pdf`,
            fileName: 'teklif.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 1234,
            createdAt: new Date('2026-01-01'),
          },
        ],
      }),
    ]);
    const buildFileUrl = vi.fn(() => 'https://api.example.com/files?key=x');
    const service = new MessagesService(
      prisma as never,
      fakeAudit,
      fakeRealtime,
      { build: buildFileUrl } as never,
      fakeStorage,
      fakeMessagesCache,
    );
    const result = await service.create(TENANT_ID, SENDER_ID, {
      subject: 'Ekli',
      body: 'Ekte dosya var.',
      toUserIds: [RECIPIENT_ID],
      ccUserIds: [],
      attachments: [
        {
          fileKey: `PILENS/development/${TENANT_ID}/messages/x.pdf`,
          fileName: 'teklif.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1234,
        },
      ],
    } as never);

    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          attachments: {
            create: [
              expect.objectContaining({
                tenantId: TENANT_ID,
                fileName: 'teklif.pdf',
                mimeType: 'application/pdf',
                sizeBytes: 1234,
              }),
            ],
          },
        }),
      }),
    );
    expect(result.attachments).toEqual([
      expect.objectContaining({
        id: 'att-1',
        fileName: 'teklif.pdf',
        url: 'https://api.example.com/files?key=x',
      }),
    ]);
  });

  it('uploadAttachment: gecerli dosyayi R2 anahtar sablonuyla yukler', async () => {
    const upload = vi.fn();
    const service = new MessagesService(
      createPrisma() as never,
      fakeAudit,
      fakeRealtime,
      fakeFileUrl,
      { upload, delete: vi.fn(), download: vi.fn() } as never,
      fakeMessagesCache,
    );
    const result = await service.uploadAttachment(TENANT_ID, {
      mimetype: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\nfake'),
      originalname: 'teklif.pdf',
    });
    expect(upload).toHaveBeenCalledWith(
      expect.stringContaining(`PILENS/development/${TENANT_ID}/messages/`),
      expect.any(Buffer),
      'application/pdf',
    );
    expect(result.fileName).toBe('teklif.pdf');
    expect(result.fileKey).toContain(`/${TENANT_ID}/messages/`);
  });

  it("deleteUnattachedFile: baska tenant'in anahtarini silmeye calisirsa NOT_FOUND firlatir", async () => {
    const del = vi.fn();
    const service = new MessagesService(
      createPrisma() as never,
      fakeAudit,
      fakeRealtime,
      fakeFileUrl,
      { upload: vi.fn(), delete: del, download: vi.fn() } as never,
      fakeMessagesCache,
    );
    await expect(
      service.deleteUnattachedFile(
        TENANT_ID,
        'PILENS/development/other-tenant/messages/x.pdf',
      ),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<AppException>);
    expect(del).not.toHaveBeenCalled();
  });

  it('create: conversationId verilince katilimci dogrulamasi yapip ayni konusmaya ekler', async () => {
    const prisma = createPrisma();
    const service = new MessagesService(
      prisma as never,
      fakeAudit,
      fakeRealtime,
      fakeFileUrl,
      fakeStorage,
      fakeMessagesCache,
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
          subject: 'Konu',
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
      fakeFileUrl,
      fakeStorage,
      fakeMessagesCache,
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

  it('setConversationRead: ilgisiz kullanici icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma([]);
    const service = new MessagesService(
      prisma as never,
      fakeAudit,
      fakeRealtime,
      fakeFileUrl,
      fakeStorage,
      fakeMessagesCache,
    );
    await expect(
      service.setConversationRead(CONVERSATION_ID, BYSTANDER_ID),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<AppException>);
  });

  it('setConversationRead: varsayilan (read=true) okunmamis mesajlari okundu isaretler', async () => {
    const prisma = createPrisma();
    const service = new MessagesService(
      prisma as never,
      fakeAudit,
      fakeRealtime,
      fakeFileUrl,
      fakeStorage,
      fakeMessagesCache,
    );
    await service.setConversationRead(CONVERSATION_ID, RECIPIENT_ID);
    expect(prisma.messageRecipient.updateMany).toHaveBeenCalledWith({
      where: {
        messageId: { in: ['message-1'] },
        userId: RECIPIENT_ID,
        readAt: null,
      },
      data: { readAt: expect.any(Date) },
    });
  });

  it('setConversationRead: read=false verilince okunmus mesajlari tekrar okunmadi yapar', async () => {
    const prisma = createPrisma();
    const service = new MessagesService(
      prisma as never,
      fakeAudit,
      fakeRealtime,
      fakeFileUrl,
      fakeStorage,
      fakeMessagesCache,
    );
    await service.setConversationRead(CONVERSATION_ID, RECIPIENT_ID, false);
    expect(prisma.messageRecipient.updateMany).toHaveBeenCalledWith({
      where: {
        messageId: { in: ['message-1'] },
        userId: RECIPIENT_ID,
        readAt: { not: null },
      },
      data: { readAt: null },
    });
  });

  it('setConversationStar: konusmayi goremeyen kullanici NOT_FOUND alir', async () => {
    const prisma = createPrisma([]);
    const service = new MessagesService(
      prisma as never,
      fakeAudit,
      fakeRealtime,
      fakeFileUrl,
      fakeStorage,
      fakeMessagesCache,
    );
    await expect(
      service.setConversationStar(
        CONVERSATION_ID,
        BYSTANDER_ID,
        TENANT_ID,
        true,
      ),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<AppException>);
  });

  it('setConversationStar: starred=true ve daha once yildizlanmamissa yeni kayit olusturur', async () => {
    const prisma = createPrisma();
    const service = new MessagesService(
      prisma as never,
      fakeAudit,
      fakeRealtime,
      fakeFileUrl,
      fakeStorage,
      fakeMessagesCache,
    );
    await service.setConversationStar(
      CONVERSATION_ID,
      RECIPIENT_ID,
      TENANT_ID,
      true,
    );
    expect(prisma.messageStar.create).toHaveBeenCalledWith({
      data: {
        tenantId: TENANT_ID,
        userId: RECIPIENT_ID,
        conversationId: CONVERSATION_ID,
      },
    });
  });

  it('setConversationStar: zaten yildizliysa tekrar create cagirmaz', async () => {
    const prisma = createPrisma();
    prisma.messageStar.findFirst = vi.fn().mockResolvedValue({ id: 'star-1' });
    const service = new MessagesService(
      prisma as never,
      fakeAudit,
      fakeRealtime,
      fakeFileUrl,
      fakeStorage,
      fakeMessagesCache,
    );
    await service.setConversationStar(
      CONVERSATION_ID,
      RECIPIENT_ID,
      TENANT_ID,
      true,
    );
    expect(prisma.messageStar.create).not.toHaveBeenCalled();
  });

  it('setConversationStar: starred=false verilince yildiz kaydini siler', async () => {
    const prisma = createPrisma();
    const service = new MessagesService(
      prisma as never,
      fakeAudit,
      fakeRealtime,
      fakeFileUrl,
      fakeStorage,
      fakeMessagesCache,
    );
    await service.setConversationStar(
      CONVERSATION_ID,
      RECIPIENT_ID,
      TENANT_ID,
      false,
    );
    expect(prisma.messageStar.deleteMany).toHaveBeenCalledWith({
      where: { userId: RECIPIENT_ID, conversationId: CONVERSATION_ID },
    });
  });

  it('list: sonuclara sadece yildizlanan konusmalar icin starred=true ekler', async () => {
    const prisma = createPrisma();
    prisma.messageStar.findMany = vi
      .fn()
      .mockResolvedValue([{ conversationId: CONVERSATION_ID }]);
    const service = new MessagesService(
      prisma as never,
      fakeAudit,
      fakeRealtime,
      fakeFileUrl,
      fakeStorage,
      fakeMessagesCache,
    );
    const result = await service.list(SENDER_ID, {
      page: 1,
      pageSize: 25,
    } as never);
    expect(result.data[0]?.starred).toBe(true);
  });
});
