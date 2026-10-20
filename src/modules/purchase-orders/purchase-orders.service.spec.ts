import { AppException } from '../../core/errors/app.exception';
import { PurchaseOrdersService } from './purchase-orders.service';

const auditLog = vi.fn();
const fakeAudit = { log: auditLog } as never;
const fakeCache = {
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn(),
  invalidate: vi.fn(),
} as never;

function createQuoteRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'quote-1',
    accountId: 'account-1',
    quoteNumber: 'TEK-2026-09-07-001',
    status: 'APPROVED',
    items: [
      {
        productId: 'product-1',
        quantity: '5.000',
        product: { id: 'product-1', name: 'Sunucu', productListId: 'list-1' },
      },
      {
        productId: 'product-2',
        quantity: '2.000',
        product: { id: 'product-2', name: 'Klavye', productListId: 'list-1' },
      },
    ],
    ...overrides,
  };
}

function createPurchaseOrderRow(
  overrides: Partial<Record<string, unknown>> = {},
) {
  return {
    id: 'po-1',
    orderNumber: 'SIP-2026-09-07-001',
    quoteId: 'quote-1',
    status: 'DRAFT',
    items: [],
    ...overrides,
  };
}

interface Setup {
  quoteRow?: unknown;
  purchaseOrderRow?: unknown;
  stockItems?: unknown[];
}

function createPrisma({
  quoteRow = createQuoteRow(),
  purchaseOrderRow = createPurchaseOrderRow(),
  stockItems = [],
}: Setup = {}) {
  const tx = {
    product: {
      findMany: vi.fn().mockResolvedValue([{ id: 'product-1' }]),
    },
    purchaseOrder: {
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue(purchaseOrderRow),
      update: vi.fn().mockResolvedValue(purchaseOrderRow),
    },
    purchaseOrderItem: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
  return {
    quote: {
      findFirst: vi.fn().mockResolvedValue(quoteRow),
    },
    product: {
      findMany: vi.fn().mockResolvedValue([{ id: 'product-1' }]),
    },
    stockItem: {
      findMany: vi.fn().mockResolvedValue(stockItems),
    },
    purchaseOrder: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      findFirst: vi.fn().mockResolvedValue(purchaseOrderRow),
      update: vi.fn().mockResolvedValue(purchaseOrderRow),
      delete: vi.fn().mockResolvedValue(purchaseOrderRow),
    },
    purchaseOrderItem: {
      update: vi.fn().mockResolvedValue({}),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(tx)),
    __tx: tx,
  };
}

function createPurchaseOrderItemRow(
  overrides: Partial<Record<string, unknown>> = {},
) {
  return {
    id: 'poi-1',
    purchaseOrderId: 'po-1',
    productId: 'product-1',
    description: 'Sunucu',
    quantity: '5.000',
    receivedQuantity: '0.000',
    isCancelled: false,
    source: 'EXTRA',
    ...overrides,
  };
}

describe('PurchaseOrdersService', () => {
  beforeEach(() => {
    auditLog.mockClear();
  });

  it('getById: bulunamayan siparis icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma({ purchaseOrderRow: null });
    const service = new PurchaseOrdersService(
      prisma as never,
      fakeAudit,
      fakeCache,
    );
    await expect(service.getById('yok')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<AppException>);
  });

  it('getDraftFromQuote: onaylanmamis teklif icin QUOTE_NOT_APPROVED firlatir', async () => {
    const prisma = createPrisma({
      quoteRow: createQuoteRow({ status: 'PENDING_APPROVAL' }),
    });
    const service = new PurchaseOrdersService(
      prisma as never,
      fakeAudit,
      fakeCache,
    );
    await expect(service.getDraftFromQuote('quote-1')).rejects.toMatchObject({
      code: 'QUOTE_NOT_APPROVED',
    });
  });

  it('getDraftFromQuote: teklif bulunamazsa NOT_FOUND firlatir', async () => {
    const prisma = createPrisma({ quoteRow: null });
    const service = new PurchaseOrdersService(
      prisma as never,
      fakeAudit,
      fakeCache,
    );
    await expect(service.getDraftFromQuote('yok')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('getDraftFromQuote: stok yoksa teklif miktari kadar onerilen kalem miktari dondurur (SP2), hicbir kayit olusturmaz', async () => {
    const prisma = createPrisma({ stockItems: [] });
    const service = new PurchaseOrdersService(
      prisma as never,
      fakeAudit,
      fakeCache,
    );
    const draft = await service.getDraftFromQuote('quote-1');

    expect(draft).toEqual({
      accountId: 'account-1',
      quoteId: 'quote-1',
      quoteNumber: 'TEK-2026-09-07-001',
      items: [
        {
          productId: 'product-1',
          productListId: 'list-1',
          productName: 'Sunucu',
          quantity: 5,
        },
        {
          productId: 'product-2',
          productListId: 'list-1',
          productName: 'Klavye',
          quantity: 2,
        },
      ],
    });
    const tx = (
      prisma as unknown as {
        __tx: { purchaseOrder: { create: ReturnType<typeof vi.fn> } };
      }
    ).__tx;
    expect(tx.purchaseOrder.create).not.toHaveBeenCalled();
    expect(auditLog).not.toHaveBeenCalled();
  });

  it('getDraftFromQuote: stok mevcut urun icin miktari 0a dusurur, taban sifirin altina inmez (SP2)', async () => {
    const prisma = createPrisma({
      stockItems: [
        { productId: 'product-1', quantity: '100.000' },
        { productId: 'product-2', quantity: '1.000' },
      ],
    });
    const service = new PurchaseOrdersService(
      prisma as never,
      fakeAudit,
      fakeCache,
    );
    const draft = await service.getDraftFromQuote('quote-1');

    expect(draft.items).toEqual([
      expect.objectContaining({ productId: 'product-1', quantity: 0 }),
      expect.objectContaining({ productId: 'product-2', quantity: 1 }),
    ]);
  });

  it('create: teklif verilmeden (quoteId olmadan) manuel siparis olusturur', async () => {
    const prisma = createPrisma();
    const service = new PurchaseOrdersService(
      prisma as never,
      fakeAudit,
      fakeCache,
    );
    await service.create('user-1', {
      items: [{ description: 'Ek malzeme', quantity: 3 }],
    } as never);

    const tx = (
      prisma as unknown as {
        __tx: { purchaseOrder: { create: ReturnType<typeof vi.fn> } };
      }
    ).__tx;
    expect(tx.purchaseOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          quoteId: null,
          items: {
            create: [
              expect.objectContaining({
                productId: null,
                description: 'Ek malzeme',
                quantity: 3,
                source: 'EXTRA',
              }),
            ],
          },
        }),
      }),
    );
    expect(auditLog).toHaveBeenCalled();
  });

  it('create: quoteId verilirse siparisi o teklife baglar', async () => {
    const prisma = createPrisma();
    const service = new PurchaseOrdersService(
      prisma as never,
      fakeAudit,
      fakeCache,
    );
    await service.create('user-1', {
      quoteId: 'quote-1',
      items: [{ productId: 'product-1', description: '', quantity: 1 }],
    } as never);

    const tx = (
      prisma as unknown as {
        __tx: { purchaseOrder: { create: ReturnType<typeof vi.fn> } };
      }
    ).__tx;
    expect(tx.purchaseOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ quoteId: 'quote-1' }),
      }),
    );
  });

  it('create: quoteId verilip teklif bulunamazsa NOT_FOUND firlatir', async () => {
    const prisma = createPrisma({ quoteRow: null });
    const service = new PurchaseOrdersService(
      prisma as never,
      fakeAudit,
      fakeCache,
    );
    await expect(
      service.create('user-1', {
        quoteId: 'yok',
        items: [{ description: 'x', quantity: 1 }],
      } as never),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('create: secilen urun bulunamazsa PRODUCT_NOT_FOUND firlatir', async () => {
    const prisma = createPrisma();
    prisma.product.findMany.mockResolvedValue([]);
    const service = new PurchaseOrdersService(
      prisma as never,
      fakeAudit,
      fakeCache,
    );
    await expect(
      service.create('user-1', {
        items: [{ productId: 'yok', description: '', quantity: 1 }],
      } as never),
    ).rejects.toMatchObject({ code: 'PRODUCT_NOT_FOUND' });
  });

  it('create: ayni clientRequestId ile zaten olusturulmus bir siparis varsa yeni kayit acmaz, mevcut kaydi dondurur (idempotent)', async () => {
    const existing = createPurchaseOrderRow({ id: 'po-existing' });
    const prisma = createPrisma({ purchaseOrderRow: existing });
    const service = new PurchaseOrdersService(
      prisma as never,
      fakeAudit,
      fakeCache,
    );

    const result = await service.create('user-1', {
      items: [{ description: 'Ek malzeme', quantity: 3 }],
      clientRequestId: 'req-1',
    } as never);

    expect(result.id).toBe('po-existing');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(auditLog).not.toHaveBeenCalled();
  });

  it('create: es zamanli iki istek ayni clientRequestId ile yarisirsa (TOCTOU), kaybeden P2002 yerine kazananin kaydini dondurur (idempotent)', async () => {
    const existing = createPurchaseOrderRow({ id: 'po-winner' });
    const prisma = createPrisma({ purchaseOrderRow: null });
    // ilk findFirst (idempotency on-kontrolu) bos donsun, create P2002 firlatsin,
    // sonraki findFirst (race sonrasi tekrar kontrol + getById) kazananin kaydini
    // dondursun.
    prisma.purchaseOrder.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValue(existing);
    const { Prisma } = await import('@prisma/client');
    prisma.__tx.purchaseOrder.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'x',
        meta: { target: ['tenantId', 'clientRequestId'] },
      }),
    );
    const service = new PurchaseOrdersService(
      prisma as never,
      fakeAudit,
      fakeCache,
    );

    const result = await service.create('user-1', {
      items: [{ description: 'Ek malzeme', quantity: 3 }],
      clientRequestId: 'req-race',
    } as never);

    expect(result.id).toBe('po-winner');
  });

  it('update: quoteId ile bulunamayan teklife baglanirsa NOT_FOUND firlatir', async () => {
    const prisma = createPrisma({ quoteRow: null });
    const service = new PurchaseOrdersService(
      prisma as never,
      fakeAudit,
      fakeCache,
    );
    await expect(
      service.update('po-1', { quoteId: 'yok' } as never),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('update: quoteId null verilirse siparisin teklif baglantisini kaldirir', async () => {
    const prisma = createPrisma();
    const service = new PurchaseOrdersService(
      prisma as never,
      fakeAudit,
      fakeCache,
    );
    await service.update('po-1', { quoteId: null } as never);

    const tx = (
      prisma as unknown as {
        __tx: { purchaseOrder: { update: ReturnType<typeof vi.fn> } };
      }
    ).__tx;
    expect(tx.purchaseOrder.update).toHaveBeenCalledWith({
      where: { id: 'po-1' },
      data: { quoteId: null },
    });
  });

  it('update: bulunamayan siparis icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma({ purchaseOrderRow: null });
    const service = new PurchaseOrdersService(
      prisma as never,
      fakeAudit,
      fakeCache,
    );
    await expect(
      service.update('yok', { status: 'CONFIRMED' } as never),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('update: items verilirse eski kalemleri silip yenilerini yazar (kaynak dogrulamasi DTO seviyesinde)', async () => {
    const prisma = createPrisma();
    const service = new PurchaseOrdersService(
      prisma as never,
      fakeAudit,
      fakeCache,
    );
    await service.update('po-1', {
      items: [
        {
          productId: 'product-1',
          description: 'Sunucu',
          quantity: 3,
          source: 'QUOTE',
        },
        {
          description: 'Ek kablo (stokta yok)',
          quantity: 1,
          source: 'EXTRA',
        },
      ],
    } as never);

    const tx = (
      prisma as unknown as {
        __tx: {
          purchaseOrderItem: {
            deleteMany: ReturnType<typeof vi.fn>;
            createMany: ReturnType<typeof vi.fn>;
          };
        };
      }
    ).__tx;
    expect(tx.purchaseOrderItem.deleteMany).toHaveBeenCalledWith({
      where: { purchaseOrderId: 'po-1' },
    });
    expect(tx.purchaseOrderItem.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ productId: 'product-1', source: 'QUOTE' }),
        expect.objectContaining({ productId: null, source: 'EXTRA' }),
      ],
    });
    expect(auditLog).toHaveBeenCalled();
  });

  it('setItemReceivedQuantity: kalem bulunamazsa NOT_FOUND firlatir', async () => {
    const prisma = createPrisma({
      purchaseOrderRow: createPurchaseOrderRow({ items: [] }),
    });
    const service = new PurchaseOrdersService(
      prisma as never,
      fakeAudit,
      fakeCache,
    );
    await expect(
      service.setItemReceivedQuantity('po-1', 'yok', 1),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('setItemReceivedQuantity: miktar araligin disindaysa INVALID_RECEIVED_QUANTITY firlatir', async () => {
    const prisma = createPrisma({
      purchaseOrderRow: createPurchaseOrderRow({
        status: 'CONFIRMED',
        items: [createPurchaseOrderItemRow({ quantity: '5.000' })],
      }),
    });
    const service = new PurchaseOrdersService(
      prisma as never,
      fakeAudit,
      fakeCache,
    );
    await expect(
      service.setItemReceivedQuantity('po-1', 'poi-1', 6),
    ).rejects.toMatchObject({ code: 'INVALID_RECEIVED_QUANTITY' });
  });

  it('otomatik durum senkronizasyonu (teslim alma bazli): iptal olmayan tum kalemler tam teslim alinirsa durum FULLY_RECEIVED olur', async () => {
    const initial = createPurchaseOrderRow({
      status: 'CONFIRMED',
      items: [
        createPurchaseOrderItemRow({
          id: 'poi-1',
          quantity: '5.000',
          receivedQuantity: '0.000',
        }),
        createPurchaseOrderItemRow({
          id: 'poi-2',
          quantity: '2.000',
          receivedQuantity: '2.000',
        }),
      ],
    });
    const updated = createPurchaseOrderRow({
      status: 'CONFIRMED',
      items: [
        createPurchaseOrderItemRow({
          id: 'poi-1',
          quantity: '5.000',
          receivedQuantity: '5.000',
        }),
        createPurchaseOrderItemRow({
          id: 'poi-2',
          quantity: '2.000',
          receivedQuantity: '2.000',
        }),
      ],
    });
    const prisma = createPrisma({ purchaseOrderRow: initial });
    prisma.purchaseOrder.findFirst = vi
      .fn()
      .mockResolvedValueOnce(initial)
      .mockResolvedValue(updated);
    const service = new PurchaseOrdersService(
      prisma as never,
      fakeAudit,
      fakeCache,
    );

    await service.setItemReceivedQuantity('po-1', 'poi-1', 5);

    expect(prisma.purchaseOrder.update).toHaveBeenCalledWith({
      where: { id: 'po-1' },
      data: { status: 'FULLY_RECEIVED' },
    });
  });

  it('otomatik durum senkronizasyonu: bazi kalemler teslim alinip bazilari alinmazsa durum PARTIALLY_RECEIVED olur', async () => {
    const initial = createPurchaseOrderRow({
      status: 'CONFIRMED',
      items: [
        createPurchaseOrderItemRow({
          id: 'poi-1',
          quantity: '5.000',
          receivedQuantity: '0.000',
        }),
        createPurchaseOrderItemRow({
          id: 'poi-2',
          quantity: '2.000',
          receivedQuantity: '0.000',
        }),
      ],
    });
    const updated = createPurchaseOrderRow({
      status: 'CONFIRMED',
      items: [
        createPurchaseOrderItemRow({
          id: 'poi-1',
          quantity: '5.000',
          receivedQuantity: '3.000',
        }),
        createPurchaseOrderItemRow({
          id: 'poi-2',
          quantity: '2.000',
          receivedQuantity: '0.000',
        }),
      ],
    });
    const prisma = createPrisma({ purchaseOrderRow: initial });
    prisma.purchaseOrder.findFirst = vi
      .fn()
      .mockResolvedValueOnce(initial)
      .mockResolvedValue(updated);
    const service = new PurchaseOrdersService(
      prisma as never,
      fakeAudit,
      fakeCache,
    );

    await service.setItemReceivedQuantity('po-1', 'poi-1', 3);

    expect(prisma.purchaseOrder.update).toHaveBeenCalledWith({
      where: { id: 'po-1' },
      data: { status: 'PARTIALLY_RECEIVED' },
    });
  });

  it('otomatik durum senkronizasyonu: FULLY_RECEIVED siparisteki bir kalem geri alinirsa durum CONFIRMED olur', async () => {
    const initial = createPurchaseOrderRow({
      status: 'FULLY_RECEIVED',
      items: [
        createPurchaseOrderItemRow({
          id: 'poi-1',
          quantity: '5.000',
          receivedQuantity: '5.000',
        }),
      ],
    });
    const updated = createPurchaseOrderRow({
      status: 'FULLY_RECEIVED',
      items: [
        createPurchaseOrderItemRow({
          id: 'poi-1',
          quantity: '5.000',
          receivedQuantity: '0.000',
        }),
      ],
    });
    const prisma = createPrisma({ purchaseOrderRow: initial });
    prisma.purchaseOrder.findFirst = vi
      .fn()
      .mockResolvedValueOnce(initial)
      .mockResolvedValue(updated);
    const service = new PurchaseOrdersService(
      prisma as never,
      fakeAudit,
      fakeCache,
    );

    await service.setItemReceivedQuantity('po-1', 'poi-1', 0);

    expect(prisma.purchaseOrder.update).toHaveBeenCalledWith({
      where: { id: 'po-1' },
      data: { status: 'CONFIRMED' },
    });
  });

  it('otomatik durum senkronizasyonu: CANCELLED siparislerde kalem degisse de durumu degistirmez', async () => {
    const order = createPurchaseOrderRow({
      status: 'CANCELLED',
      items: [
        createPurchaseOrderItemRow({
          id: 'poi-1',
          quantity: '5.000',
          receivedQuantity: '0.000',
        }),
      ],
    });
    const prisma = createPrisma({ purchaseOrderRow: order });
    const service = new PurchaseOrdersService(
      prisma as never,
      fakeAudit,
      fakeCache,
    );

    await service.setItemReceivedQuantity('po-1', 'poi-1', 5);

    expect(prisma.purchaseOrder.update).not.toHaveBeenCalled();
  });

  it('otomatik durum senkronizasyonu: COMPLETED siparislerde kalem degisse de durumu degistirmez', async () => {
    const order = createPurchaseOrderRow({
      status: 'COMPLETED',
      items: [
        createPurchaseOrderItemRow({
          id: 'poi-1',
          quantity: '5.000',
          receivedQuantity: '0.000',
        }),
      ],
    });
    const prisma = createPrisma({ purchaseOrderRow: order });
    const service = new PurchaseOrdersService(
      prisma as never,
      fakeAudit,
      fakeCache,
    );

    await service.setItemReceivedQuantity('po-1', 'poi-1', 5);

    expect(prisma.purchaseOrder.update).not.toHaveBeenCalled();
  });

  it('otomatik durum senkronizasyonu: tum kalemler iptal edilmisse durumu degistirmez', async () => {
    const order = createPurchaseOrderRow({
      status: 'CONFIRMED',
      items: [
        createPurchaseOrderItemRow({
          id: 'poi-1',
          quantity: '5.000',
          receivedQuantity: '0.000',
          isCancelled: true,
        }),
      ],
    });
    const prisma = createPrisma({ purchaseOrderRow: order });
    const service = new PurchaseOrdersService(
      prisma as never,
      fakeAudit,
      fakeCache,
    );

    await service.setItemCancelled('po-1', 'poi-1', true);

    expect(prisma.purchaseOrder.update).not.toHaveBeenCalled();
  });

  it('otomatik durum senkronizasyonu: hesaplanan durum zaten mevcut durumla ayniysa guncelleme yapmaz (idempotent)', async () => {
    const order = createPurchaseOrderRow({
      status: 'PARTIALLY_RECEIVED',
      items: [
        createPurchaseOrderItemRow({
          id: 'poi-1',
          quantity: '5.000',
          receivedQuantity: '3.000',
        }),
      ],
    });
    const prisma = createPrisma({ purchaseOrderRow: order });
    const service = new PurchaseOrdersService(
      prisma as never,
      fakeAudit,
      fakeCache,
    );

    await service.setItemReceivedQuantity('po-1', 'poi-1', 3);

    expect(prisma.purchaseOrder.update).not.toHaveBeenCalled();
  });

  it('update: durum FULLY_RECEIVED secilince iptal olmayan tum kalemleri tam teslim alinmis isaretler', async () => {
    const order = createPurchaseOrderRow({
      status: 'CONFIRMED',
      items: [
        createPurchaseOrderItemRow({
          id: 'poi-1',
          quantity: '5.000',
          receivedQuantity: '0.000',
        }),
        createPurchaseOrderItemRow({
          id: 'poi-2',
          quantity: '2.000',
          receivedQuantity: '0.000',
          isCancelled: true,
        }),
      ],
    });
    const prisma = createPrisma({ purchaseOrderRow: order });
    const service = new PurchaseOrdersService(
      prisma as never,
      fakeAudit,
      fakeCache,
    );

    await service.update('po-1', { status: 'FULLY_RECEIVED' } as never);

    expect(prisma.purchaseOrderItem.update).toHaveBeenCalledWith({
      where: { id: 'poi-1' },
      data: { receivedQuantity: '5.000' },
    });
    expect(prisma.purchaseOrderItem.update).not.toHaveBeenCalledWith({
      where: { id: 'poi-2' },
      data: expect.anything(),
    });
  });

  it('update: durum FULLY_RECEIVED disindaki bir degere gecince kalemlere dokunmaz', async () => {
    const order = createPurchaseOrderRow({
      status: 'DRAFT',
      items: [createPurchaseOrderItemRow({ id: 'poi-1' })],
    });
    const prisma = createPrisma({ purchaseOrderRow: order });
    const service = new PurchaseOrdersService(
      prisma as never,
      fakeAudit,
      fakeCache,
    );

    await service.update('po-1', { status: 'CONFIRMED' } as never);

    expect(prisma.purchaseOrderItem.update).not.toHaveBeenCalled();
  });

  it('remove: siparisi siler ve audit log yazar', async () => {
    const prisma = createPrisma();
    const service = new PurchaseOrdersService(
      prisma as never,
      fakeAudit,
      fakeCache,
    );
    await service.remove('po-1');
    expect(prisma.purchaseOrder.delete).toHaveBeenCalledWith({
      where: { id: 'po-1' },
    });
    expect(auditLog).toHaveBeenCalled();
  });
});
