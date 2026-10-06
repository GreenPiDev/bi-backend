import { AppException } from '../../core/errors/app.exception';
import { TenantContext } from '../../core/tenant/tenant-context';
import { DrawingTemplatesService } from './drawing-templates.service';

function createPrisma() {
  return {
    drawingPanelTemplate: {
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

describe('DrawingTemplatesService', () => {
  it('list: tenant pano sablonlarini isme gore siralayarak doner', async () => {
    const prisma = createPrisma();
    const service = new DrawingTemplatesService(prisma as never);
    await runInTenant(() => service.list());
    expect(prisma.drawingPanelTemplate.findMany).toHaveBeenCalledWith({
      orderBy: { name: 'asc' },
    });
  });

  it('create: isBuiltIn her zaman false olarak yaratilir', async () => {
    const prisma = createPrisma();
    prisma.drawingPanelTemplate.create.mockResolvedValue({ id: 't1' });
    const service = new DrawingTemplatesService(prisma as never);
    await runInTenant(() =>
      service.create({
        name: 'Özel Şablon',
        type: 'AG_BACKPLATE',
        widthMm: 1000,
        heightMm: 2000,
        layout: {},
      }),
    );
    expect(prisma.drawingPanelTemplate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ isBuiltIn: false }),
    });
  });

  it('update: bulunamayan sablon icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma();
    const service = new DrawingTemplatesService(prisma as never);
    await expect(
      runInTenant(() => service.update('yok', { name: 'x' })),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<AppException>);
  });

  it('remove: bulunamayan sablon icin NOT_FOUND firlatir', async () => {
    const prisma = createPrisma();
    const service = new DrawingTemplatesService(prisma as never);
    await expect(
      runInTenant(() => service.remove('yok')),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<AppException>);
  });

  it('remove: var olan sablonu siler', async () => {
    const prisma = createPrisma();
    prisma.drawingPanelTemplate.findFirst.mockResolvedValue({ id: 't1' });
    const service = new DrawingTemplatesService(prisma as never);
    await runInTenant(() => service.remove('t1'));
    expect(prisma.drawingPanelTemplate.delete).toHaveBeenCalledWith({
      where: { id: 't1' },
    });
  });
});
