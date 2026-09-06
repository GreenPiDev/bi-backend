import { AppException } from '../../core/errors/app.exception';
import { ProductsService } from './products.service';

const auditLog = vi.fn();
const fakeAudit = { log: auditLog } as never;

function createProductRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'product-1',
    name: 'Dizustu Bilgisayar',
    sku: 'SKU-1',
    unit: 'adet',
    ...overrides,
  };
}

function createPrisma(row: unknown = createProductRow()) {
  return {
    product: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      findFirst: vi.fn().mockResolvedValue(row),
      create: vi.fn().mockResolvedValue(row),
      update: vi.fn().mockResolvedValue(row),
      delete: vi.fn().mockResolvedValue(row),
    },
  };
}

describe('ProductsService', () => {
  it('getById: bulunamayan urun icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma(null);
    const service = new ProductsService(prisma as never, fakeAudit);
    await expect(service.getById('yok')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<AppException>);
  });

  it('create: urunu olusturur ve audit log yazar', async () => {
    const prisma = createPrisma();
    const service = new ProductsService(prisma as never, fakeAudit);
    await service.create({
      name: 'Dizustu Bilgisayar',
      unit: 'adet',
    } as never);
    expect(prisma.product.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'Dizustu Bilgisayar' }),
      }),
    );
    expect(auditLog).toHaveBeenCalled();
  });

  it('update: bulunamayan urun icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma(null);
    const service = new ProductsService(prisma as never, fakeAudit);
    await expect(
      service.update('yok', { name: 'x' } as never),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('remove: urunu siler ve audit log yazar', async () => {
    const prisma = createPrisma();
    const service = new ProductsService(prisma as never, fakeAudit);
    await service.remove('product-1');
    expect(prisma.product.delete).toHaveBeenCalledWith({
      where: { id: 'product-1' },
    });
  });
});
