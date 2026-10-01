import { Prisma } from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import { TenantContext } from '../../core/tenant/tenant-context';
import { WarehousesService } from './warehouses.service';

const auditLog = vi.fn();
const fakeAudit = { log: auditLog } as never;
const fakeRealtime = { emitToTenant: vi.fn(), emitToAll: vi.fn() };

function runInTenant<T>(fn: () => Promise<T>): Promise<T> {
  return TenantContext.run({ tenantId: 't1', userId: 'u1', roleIds: [] }, fn);
}

function createWarehouseRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'warehouse-1',
    name: 'Ana Depo',
    ...overrides,
  };
}

function createPrisma(row: unknown = createWarehouseRow(), stockItemCount = 0) {
  const prisma = {
    warehouse: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      findFirst: vi.fn().mockResolvedValue(row),
      create: vi.fn().mockResolvedValue(row),
      update: vi.fn().mockResolvedValue(row),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      delete: vi.fn().mockResolvedValue(row),
    },
    stockItem: {
      count: vi.fn().mockResolvedValue(stockItemCount),
    },
    $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
  };
  return prisma;
}

const P2002_ERROR = new Prisma.PrismaClientKnownRequestError('duplicate', {
  code: 'P2002',
  clientVersion: '6.0.0',
});

describe('WarehousesService', () => {
  it('getById: bulunamayan depo icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma(null);
    const service = new WarehousesService(
      prisma as never,
      fakeAudit,
      fakeRealtime as never,
    );
    await expect(service.getById('yok')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<AppException>);
  });

  it('create: depoyu olusturur ve audit log yazar', async () => {
    const prisma = createPrisma();
    const service = new WarehousesService(
      prisma as never,
      fakeAudit,
      fakeRealtime as never,
    );
    await runInTenant(() => service.create({ name: 'Merkez Depo' }));
    expect(prisma.warehouse.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Merkez Depo',
          isDefault: false,
        }),
      }),
    );
    expect(auditLog).toHaveBeenCalled();
  });

  it('create: varsayilan olarak isaretlenirse digerlerinin varsayilan bayragini kaldirir', async () => {
    const prisma = createPrisma();
    const service = new WarehousesService(
      prisma as never,
      fakeAudit,
      fakeRealtime as never,
    );
    await runInTenant(() =>
      service.create({ name: 'Merkez Depo', isDefault: true }),
    );
    expect(prisma.warehouse.updateMany).toHaveBeenCalledWith({
      where: { isDefault: true },
      data: { isDefault: false },
    });
    expect(prisma.warehouse.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'Merkez Depo', isDefault: true }),
      }),
    );
  });

  it('create: varsayilan degilse digerlerine dokunmaz', async () => {
    const prisma = createPrisma();
    const service = new WarehousesService(
      prisma as never,
      fakeAudit,
      fakeRealtime as never,
    );
    await runInTenant(() => service.create({ name: 'Merkez Depo' }));
    expect(prisma.warehouse.updateMany).not.toHaveBeenCalled();
  });

  it('update: varsayilan olarak isaretlenirse digerlerinin (kendisi haric) varsayilan bayragini kaldirir', async () => {
    const prisma = createPrisma();
    const service = new WarehousesService(
      prisma as never,
      fakeAudit,
      fakeRealtime as never,
    );
    await runInTenant(() => service.update('warehouse-1', { isDefault: true }));
    expect(prisma.warehouse.updateMany).toHaveBeenCalledWith({
      where: { isDefault: true, id: { not: 'warehouse-1' } },
      data: { isDefault: false },
    });
  });

  it('create: basarili olursa tenant odasina yayinlar', async () => {
    const prisma = createPrisma();
    const service = new WarehousesService(
      prisma as never,
      fakeAudit,
      fakeRealtime as never,
    );
    await runInTenant(() => service.create({ name: 'Merkez Depo' }));
    expect(fakeRealtime.emitToTenant).toHaveBeenCalledWith(
      't1',
      'warehouses.updated',
      expect.any(Array),
    );
  });

  it('create: ayni adda depo varsa WAREHOUSE_ALREADY_EXISTS firlatir', async () => {
    const prisma = createPrisma();
    prisma.warehouse.create.mockRejectedValue(P2002_ERROR);
    const service = new WarehousesService(
      prisma as never,
      fakeAudit,
      fakeRealtime as never,
    );
    await expect(
      runInTenant(() => service.create({ name: 'Ana Depo' })),
    ).rejects.toMatchObject({ code: 'WAREHOUSE_ALREADY_EXISTS' });
  });

  it('update: bulunamayan depo icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma(null);
    const service = new WarehousesService(
      prisma as never,
      fakeAudit,
      fakeRealtime as never,
    );
    await expect(
      service.update('yok', { name: 'Yeni Ad' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('remove: bulunamayan depo icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma(null);
    const service = new WarehousesService(
      prisma as never,
      fakeAudit,
      fakeRealtime as never,
    );
    await expect(service.remove('yok')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('remove: icinde stok kaydi varsa WAREHOUSE_NOT_EMPTY firlatir ve silmez', async () => {
    const prisma = createPrisma(createWarehouseRow(), 3);
    const service = new WarehousesService(
      prisma as never,
      fakeAudit,
      fakeRealtime as never,
    );
    await expect(service.remove('warehouse-1')).rejects.toMatchObject({
      code: 'WAREHOUSE_NOT_EMPTY',
    });
    expect(prisma.warehouse.delete).not.toHaveBeenCalled();
  });

  it('remove: depo bossa siler ve audit log yazar', async () => {
    const prisma = createPrisma(createWarehouseRow(), 0);
    const service = new WarehousesService(
      prisma as never,
      fakeAudit,
      fakeRealtime as never,
    );
    await runInTenant(() => service.remove('warehouse-1'));
    expect(prisma.warehouse.delete).toHaveBeenCalledWith({
      where: { id: 'warehouse-1' },
    });
    expect(auditLog).toHaveBeenCalled();
  });
});
