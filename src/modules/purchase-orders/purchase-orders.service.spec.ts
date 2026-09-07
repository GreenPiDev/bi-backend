import { AppException } from '../../core/errors/app.exception';
import { PurchaseOrdersService } from './purchase-orders.service';

const auditLog = vi.fn();
const fakeAudit = { log: auditLog } as never;

function createQuoteRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'quote-1',
    accountId: 'account-1',
    status: 'APPROVED',
    items: [
      {
        productId: 'product-1',
        quantity: '5.000',
        product: { id: 'product-1', name: 'Sunucu' },
      },
      {
        productId: 'product-2',
        quantity: '2.000',
        product: { id: 'product-2', name: 'Klavye' },
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
    projectId: null,
    status: 'DRAFT',
    items: [],
    ...overrides,
  };
}

interface Setup {
  quoteRow?: unknown;
  purchaseOrderRow?: unknown;
  projectRow?: unknown;
  stockItems?: unknown[];
}

function createPrisma({
  quoteRow = createQuoteRow(),
  purchaseOrderRow = createPurchaseOrderRow(),
  projectRow = null,
  stockItems = [],
}: Setup = {}) {
  const tx = {
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
    project: {
      findFirst: vi.fn().mockResolvedValue(projectRow),
    },
    stockItem: {
      findMany: vi.fn().mockResolvedValue(stockItems),
    },
    purchaseOrder: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      findFirst: vi.fn().mockResolvedValue(purchaseOrderRow),
      delete: vi.fn().mockResolvedValue(purchaseOrderRow),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(tx)),
    __tx: tx,
  };
}

describe('PurchaseOrdersService', () => {
  beforeEach(() => {
    auditLog.mockClear();
  });

  it('getById: bulunamayan siparis icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma({ purchaseOrderRow: null });
    const service = new PurchaseOrdersService(prisma as never, fakeAudit);
    await expect(service.getById('yok')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<AppException>);
  });

  it('createFromQuote: onaylanmamis teklif icin QUOTE_NOT_APPROVED firlatir', async () => {
    const prisma = createPrisma({
      quoteRow: createQuoteRow({ status: 'PENDING_APPROVAL' }),
    });
    const service = new PurchaseOrdersService(prisma as never, fakeAudit);
    await expect(
      service.createFromQuote('user-1', 'quote-1'),
    ).rejects.toMatchObject({ code: 'QUOTE_NOT_APPROVED' });
  });

  it('createFromQuote: teklif bulunamazsa NOT_FOUND firlatir', async () => {
    const prisma = createPrisma({ quoteRow: null });
    const service = new PurchaseOrdersService(prisma as never, fakeAudit);
    await expect(
      service.createFromQuote('user-1', 'yok'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('createFromQuote: stok yoksa teklif miktari kadar kalem miktari uretir (SP2)', async () => {
    const prisma = createPrisma({ stockItems: [] });
    const service = new PurchaseOrdersService(prisma as never, fakeAudit);
    await service.createFromQuote('user-1', 'quote-1');

    const tx = (
      prisma as unknown as {
        __tx: { purchaseOrder: { create: ReturnType<typeof vi.fn> } };
      }
    ).__tx;
    expect(tx.purchaseOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          quoteId: 'quote-1',
          items: {
            create: [
              {
                productId: 'product-1',
                description: 'Sunucu',
                quantity: 5,
                source: 'QUOTE',
              },
              {
                productId: 'product-2',
                description: 'Klavye',
                quantity: 2,
                source: 'QUOTE',
              },
            ],
          },
        }),
      }),
    );
    expect(auditLog).toHaveBeenCalled();
  });

  it('createFromQuote: stok mevcut urun icin miktari 0a dusurur, taban sifirin altina inmez (SP2)', async () => {
    const prisma = createPrisma({
      stockItems: [
        { productId: 'product-1', quantity: '100.000' },
        { productId: 'product-2', quantity: '1.000' },
      ],
    });
    const service = new PurchaseOrdersService(prisma as never, fakeAudit);
    await service.createFromQuote('user-1', 'quote-1');

    const tx = (
      prisma as unknown as {
        __tx: { purchaseOrder: { create: ReturnType<typeof vi.fn> } };
      }
    ).__tx;
    expect(tx.purchaseOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          items: {
            create: [
              expect.objectContaining({ productId: 'product-1', quantity: 0 }),
              expect.objectContaining({ productId: 'product-2', quantity: 1 }),
            ],
          },
        }),
      }),
    );
  });

  it('createFromQuote: quoteId ile eslesen bir Project varsa projectId setler (SP1 akis notu)', async () => {
    const prisma = createPrisma({ projectRow: { id: 'project-1' } });
    const service = new PurchaseOrdersService(prisma as never, fakeAudit);
    await service.createFromQuote('user-1', 'quote-1');

    const tx = (
      prisma as unknown as {
        __tx: { purchaseOrder: { create: ReturnType<typeof vi.fn> } };
      }
    ).__tx;
    expect(tx.purchaseOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ projectId: 'project-1' }),
      }),
    );
  });

  it('createFromQuote: SIP-YYYY-AA-GG-NNN formatinda numara uretir', async () => {
    const prisma = createPrisma();
    const service = new PurchaseOrdersService(prisma as never, fakeAudit);
    await service.createFromQuote('user-1', 'quote-1');

    const tx = (
      prisma as unknown as {
        __tx: { purchaseOrder: { create: ReturnType<typeof vi.fn> } };
      }
    ).__tx;
    expect(tx.purchaseOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderNumber: expect.stringMatching(/^SIP-\d{4}-\d{2}-\d{2}-\d{3}$/),
        }),
      }),
    );
  });

  it('update: bulunamayan siparis icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma({ purchaseOrderRow: null });
    const service = new PurchaseOrdersService(prisma as never, fakeAudit);
    await expect(
      service.update('yok', { status: 'CONFIRMED' } as never),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('update: items verilirse eski kalemleri silip yenilerini yazar (kaynak dogrulamasi DTO seviyesinde)', async () => {
    const prisma = createPrisma();
    const service = new PurchaseOrdersService(prisma as never, fakeAudit);
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

  it('remove: siparisi siler ve audit log yazar', async () => {
    const prisma = createPrisma();
    const service = new PurchaseOrdersService(prisma as never, fakeAudit);
    await service.remove('po-1');
    expect(prisma.purchaseOrder.delete).toHaveBeenCalledWith({
      where: { id: 'po-1' },
    });
    expect(auditLog).toHaveBeenCalled();
  });
});
