import { AppException } from '../../core/errors/app.exception';
import { TenantContext } from '../../core/tenant/tenant-context';
import { ProductListsService } from './product-lists.service';

const auditLog = vi.fn();
const fakeAudit = { log: auditLog } as never;
const fakeRealtime = { emitToTenant: vi.fn(), emitToAll: vi.fn() };

function runInTenant<T>(fn: () => Promise<T>): Promise<T> {
  return TenantContext.run({ tenantId: 't1', userId: 'u1', roleIds: [] }, fn);
}

function createProductListRow(
  overrides: Partial<Record<string, unknown>> = {},
) {
  return {
    id: 'product-list-1',
    name: 'Genel',
    ...overrides,
  };
}

function createPrisma(row: unknown = createProductListRow(), productCount = 0) {
  const prisma = {
    productList: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      findFirst: vi.fn().mockResolvedValue(row),
      create: vi.fn().mockResolvedValue(row),
      update: vi.fn().mockResolvedValue(row),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      delete: vi.fn().mockResolvedValue(row),
    },
    product: {
      count: vi.fn().mockResolvedValue(productCount),
    },
    $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
  };
  return prisma;
}

describe('ProductListsService', () => {
  it('getById: bulunamayan urun listesi icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma(null);
    const service = new ProductListsService(
      prisma as never,
      fakeAudit,
      fakeRealtime as never,
    );
    await expect(service.getById('yok')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<AppException>);
  });

  it('create: urun listesini olusturur ve audit log yazar', async () => {
    const prisma = createPrisma();
    const service = new ProductListsService(
      prisma as never,
      fakeAudit,
      fakeRealtime as never,
    );
    await runInTenant(() => service.create({ name: 'Bayi Katalogu' }));
    expect(prisma.productList.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { name: 'Bayi Katalogu' },
      }),
    );
    expect(auditLog).toHaveBeenCalled();
  });

  it('create: basarili olursa tenant odasina yayinlar', async () => {
    const prisma = createPrisma();
    const service = new ProductListsService(
      prisma as never,
      fakeAudit,
      fakeRealtime as never,
    );
    await runInTenant(() => service.create({ name: 'Bayi Katalogu' }));
    expect(fakeRealtime.emitToTenant).toHaveBeenCalledWith(
      't1',
      'productLists.updated',
      expect.any(Array),
    );
  });

  it('update: bulunamayan urun listesi icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma(null);
    const service = new ProductListsService(
      prisma as never,
      fakeAudit,
      fakeRealtime as never,
    );
    await expect(
      service.update('yok', { name: 'Yeni Ad' }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('remove: bulunamayan urun listesi icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma(null);
    const service = new ProductListsService(
      prisma as never,
      fakeAudit,
      fakeRealtime as never,
    );
    await expect(service.remove('yok')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('remove: icinde urun varsa PRODUCT_LIST_NOT_EMPTY firlatir ve silmez', async () => {
    const prisma = createPrisma(createProductListRow(), 3);
    const service = new ProductListsService(
      prisma as never,
      fakeAudit,
      fakeRealtime as never,
    );
    await expect(service.remove('product-list-1')).rejects.toMatchObject({
      code: 'PRODUCT_LIST_NOT_EMPTY',
    });
    expect(prisma.productList.delete).not.toHaveBeenCalled();
  });

  it('remove: liste bossa siler ve audit log yazar', async () => {
    const prisma = createPrisma(createProductListRow(), 0);
    const service = new ProductListsService(
      prisma as never,
      fakeAudit,
      fakeRealtime as never,
    );
    await runInTenant(() => service.remove('product-list-1'));
    expect(prisma.productList.delete).toHaveBeenCalledWith({
      where: { id: 'product-list-1' },
    });
    expect(auditLog).toHaveBeenCalled();
  });
});
