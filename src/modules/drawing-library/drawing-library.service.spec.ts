import { Prisma } from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import { TenantContext } from '../../core/tenant/tenant-context';
import { DrawingLibraryService } from './drawing-library.service';

function createPrisma() {
  return {
    drawingLibraryComponent: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
}

function runInTenant<T>(fn: () => Promise<T>): Promise<T> {
  return TenantContext.run({ tenantId: 't1', userId: 'u1', roleIds: [] }, fn);
}

describe('DrawingLibraryService', () => {
  it('list: tenant kutuphane elemanlarini isme gore siralayarak doner', async () => {
    const prisma = createPrisma();
    const service = new DrawingLibraryService(prisma as never);
    await runInTenant(() => service.list());
    expect(prisma.drawingLibraryComponent.findMany).toHaveBeenCalledWith({
      orderBy: { name: 'asc' },
    });
  });

  it('create: isBuiltIn her zaman false olarak yaratilir', async () => {
    const prisma = createPrisma();
    prisma.drawingLibraryComponent.create.mockResolvedValue({ id: 'c1' });
    const service = new DrawingLibraryService(prisma as never);
    await runInTenant(() =>
      service.create({
        key: 'relay',
        name: 'Röle',
        category: 'RELAY',
        defaultWidthMm: 50,
        defaultHeightMm: 80,
      }),
    );
    expect(prisma.drawingLibraryComponent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ isBuiltIn: false }),
    });
  });

  it('create: ayni anahtar zaten varsa DRAWING_LIBRARY_COMPONENT_KEY_ALREADY_EXISTS firlatir', async () => {
    const prisma = createPrisma();
    prisma.drawingLibraryComponent.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    const service = new DrawingLibraryService(prisma as never);
    await expect(
      runInTenant(() =>
        service.create({
          key: 'relay',
          name: 'Röle',
          category: 'RELAY',
          defaultWidthMm: 50,
          defaultHeightMm: 80,
        }),
      ),
    ).rejects.toMatchObject({
      code: 'DRAWING_LIBRARY_COMPONENT_KEY_ALREADY_EXISTS',
    } satisfies Partial<AppException>);
  });

  it('update: bulunamayan komponent icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma();
    const service = new DrawingLibraryService(prisma as never);
    await expect(
      runInTenant(() => service.update('yok', { name: 'x' })),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<AppException>);
  });

  it('remove: bulunamayan komponent icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma();
    const service = new DrawingLibraryService(prisma as never);
    await expect(
      runInTenant(() => service.remove('yok')),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<AppException>);
  });

  it('remove: var olan komponenti siler', async () => {
    const prisma = createPrisma();
    prisma.drawingLibraryComponent.findFirst.mockResolvedValue({ id: 'c1' });
    const service = new DrawingLibraryService(prisma as never);
    await runInTenant(() => service.remove('c1'));
    expect(prisma.drawingLibraryComponent.delete).toHaveBeenCalledWith({
      where: { id: 'c1' },
    });
  });
});
