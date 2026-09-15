import { AppException } from '../../core/errors/app.exception';
import { ProductListsService } from './product-lists.service';

const auditLog = vi.fn();
const fakeAudit = { log: auditLog } as never;

function createProductListRow(
  overrides: Partial<Record<string, unknown>> = {},
) {
  return {
    id: 'product-list-1',
    name: 'Genel',
    isDefault: true,
    ...overrides,
  };
}

function createPrisma(row: unknown = createProductListRow()) {
  return {
    productList: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      findFirst: vi.fn().mockResolvedValue(row),
      create: vi.fn().mockResolvedValue(row),
      update: vi.fn().mockResolvedValue(row),
      delete: vi.fn().mockResolvedValue(row),
    },
  };
}

describe('ProductListsService', () => {
  it('getById: bulunamayan urun listesi icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma(null);
    const service = new ProductListsService(prisma as never, fakeAudit);
    await expect(service.getById('yok')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<AppException>);
  });

  it('create: urun listesini olusturur ve audit log yazar', async () => {
    const prisma = createPrisma();
    const service = new ProductListsService(prisma as never, fakeAudit);
    await service.create({ name: 'Bayi Katalogu', isDefault: false });
    expect(prisma.productList.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { name: 'Bayi Katalogu', isDefault: false },
      }),
    );
    expect(auditLog).toHaveBeenCalled();
  });

  it('update: bulunamayan urun listesi icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma(null);
    const service = new ProductListsService(prisma as never, fakeAudit);
    await expect(
      service.update('yok', { name: 'Yeni Ad' }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('remove: bulunamayan urun listesi icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma(null);
    const service = new ProductListsService(prisma as never, fakeAudit);
    await expect(service.remove('yok')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
