import { AppException } from '../../core/errors/app.exception';
import { TenantContext } from '../../core/tenant/tenant-context';
import { DrawingsService } from './drawings.service';

function createPrisma() {
  return {
    drawing: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    drawingPanelTemplate: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    quote: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    product: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    drawingLibraryComponent: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
  };
}

function runInTenant<T>(fn: () => Promise<T>): Promise<T> {
  return TenantContext.run({ tenantId: 't1', userId: 'u1', roleIds: [] }, fn);
}

const TEMPLATE = {
  id: 'tpl1',
  widthMm: '1000',
  heightMm: '2000',
  layout: {
    clearanceMm: 20,
    bands: [
      { key: 'main-breaker', y: 300, heightMm: 500 },
      { key: 'outgoing', y: 800, heightMm: 700 },
    ],
  },
};

describe('DrawingsService', () => {
  it('list: quoteId verilmezse tum tenant cizimlerini doner', async () => {
    const prisma = createPrisma();
    const service = new DrawingsService(prisma as never);
    await runInTenant(() => service.list({}));
    expect(prisma.drawing.findMany).toHaveBeenCalledWith({
      where: undefined,
      orderBy: { createdAt: 'desc' },
    });
  });

  it('list: quoteId verilirse sadece o teklife ait cizimleri filtreler', async () => {
    const prisma = createPrisma();
    const service = new DrawingsService(prisma as never);
    await runInTenant(() => service.list({ quoteId: 'q1' }));
    expect(prisma.drawing.findMany).toHaveBeenCalledWith({
      where: { quoteId: 'q1' },
      orderBy: { createdAt: 'desc' },
    });
  });

  describe('preview', () => {
    it('bulunamayan sablon icin NOT_FOUND firlatir', async () => {
      const prisma = createPrisma();
      const service = new DrawingsService(prisma as never);
      await expect(
        runInTenant(() =>
          service.preview({ templateId: 'yok', items: [], busbars: [] }),
        ),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
      } satisfies Partial<AppException>);
    });

    it('sablonda olmayan bandKey icin UNKNOWN_BAND_KEY firlatir', async () => {
      const prisma = createPrisma();
      prisma.drawingPanelTemplate.findFirst.mockResolvedValue(TEMPLATE);
      const service = new DrawingsService(prisma as never);
      await expect(
        runInTenant(() =>
          service.preview({
            templateId: 'tpl1',
            items: [
              {
                libraryComponentKey: 'relay',
                label: 'Röle',
                category: 'RELAY',
                widthMm: 50,
                heightMm: 80,
                bandKey: 'olmayan-bant',
                quantity: 1,
              },
            ],
            busbars: [],
          }),
        ),
      ).rejects.toMatchObject({
        code: 'UNKNOWN_BAND_KEY',
      } satisfies Partial<AppException>);
    });

    it('gecerli girdide model + 3 goruntu SVG doner, quantity kadar eleman uretir', async () => {
      const prisma = createPrisma();
      prisma.drawingPanelTemplate.findFirst.mockResolvedValue(TEMPLATE);
      const service = new DrawingsService(prisma as never);
      const result = await runInTenant(() =>
        service.preview({
          templateId: 'tpl1',
          items: [
            {
              libraryComponentKey: 'switch-compact',
              label: '3X1000A',
              category: 'SWITCH',
              widthMm: 150,
              heightMm: 200,
              bandKey: 'outgoing',
              quantity: 2,
            },
          ],
          busbars: [
            {
              startX: 0,
              startY: 50,
              endX: 1000,
              endY: 50,
              thicknessMm: 10,
              phaseCount: 3,
            },
          ],
        }),
      );
      expect(result.model.plateWidthMm).toBe(1000);
      expect(result.model.plateHeightMm).toBe(2000);
      expect(result.model.views.internal.elements).toHaveLength(2);
      expect(result.model.views.external.elements).toHaveLength(0);
      expect(result.model.busbars).toHaveLength(1);
      expect(result.svg.internal).toContain('<svg');
      expect(result.svg.coverPlate).toContain('<svg');
      expect(result.svg.external).toContain('<svg');
    });

    it('CT/CAPACITOR kategorisi varsayilan olarak kapak plakali goruntuden gizlenir', async () => {
      const prisma = createPrisma();
      prisma.drawingPanelTemplate.findFirst.mockResolvedValue(TEMPLATE);
      const service = new DrawingsService(prisma as never);
      const result = await runInTenant(() =>
        service.preview({
          templateId: 'tpl1',
          items: [
            {
              libraryComponentKey: 'current-transformer',
              label: 'CT',
              category: 'CT',
              widthMm: 80,
              heightMm: 80,
              bandKey: 'main-breaker',
              quantity: 1,
            },
          ],
          busbars: [],
        }),
      );
      expect(result.model.views.internal.elements).toHaveLength(1);
      expect(result.model.views.coverPlate.elements).toHaveLength(0);
    });

    it('hiddenInCoverPlate elle false verilirse CT bile kapak plakalida gorunur', async () => {
      const prisma = createPrisma();
      prisma.drawingPanelTemplate.findFirst.mockResolvedValue(TEMPLATE);
      const service = new DrawingsService(prisma as never);
      const result = await runInTenant(() =>
        service.preview({
          templateId: 'tpl1',
          items: [
            {
              libraryComponentKey: 'current-transformer',
              label: 'CT',
              category: 'CT',
              widthMm: 80,
              heightMm: 80,
              bandKey: 'main-breaker',
              quantity: 1,
              hiddenInCoverPlate: false,
            },
          ],
          busbars: [],
        }),
      );
      expect(result.model.views.coverPlate.elements).toHaveLength(1);
    });
  });

  describe('create', () => {
    it('bulunamayan teklif icin NOT_FOUND firlatir', async () => {
      const prisma = createPrisma();
      const service = new DrawingsService(prisma as never);
      await expect(
        runInTenant(() =>
          service.create({
            quoteId: 'yok',
            templateId: 'tpl1',
            name: 'Pano-1',
            items: [],
            busbars: [],
          }),
        ),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
      } satisfies Partial<AppException>);
    });

    it('gecerli girdide modeli kurup Drawing satirini olusturur', async () => {
      const prisma = createPrisma();
      prisma.quote.findFirst.mockResolvedValue({ id: 'q1' });
      prisma.drawingPanelTemplate.findFirst.mockResolvedValue(TEMPLATE);
      prisma.drawing.create.mockResolvedValue({ id: 'd1' });
      const service = new DrawingsService(prisma as never);
      await runInTenant(() =>
        service.create({
          quoteId: 'q1',
          templateId: 'tpl1',
          name: 'Pano-1',
          items: [],
          busbars: [],
        }),
      );
      expect(prisma.drawing.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          quoteId: 'q1',
          templateId: 'tpl1',
          name: 'Pano-1',
          createdById: 'u1',
          model: expect.objectContaining({ plateWidthMm: 1000 }),
        }),
      });
    });
  });

  describe('createFromProductSelection', () => {
    it('bulunamayan teklif icin NOT_FOUND firlatir', async () => {
      const prisma = createPrisma();
      const service = new DrawingsService(prisma as never);
      await expect(
        runInTenant(() =>
          service.createFromProductSelection({
            quoteId: 'yok',
            templateId: 'tpl1',
            name: 'Pano-1',
            items: [],
          }),
        ),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
      } satisfies Partial<AppException>);
    });

    it('bulunamayan urun icin NOT_FOUND firlatir', async () => {
      const prisma = createPrisma();
      prisma.quote.findFirst.mockResolvedValue({ id: 'q1' });
      const service = new DrawingsService(prisma as never);
      await expect(
        runInTenant(() =>
          service.createFromProductSelection({
            quoteId: 'q1',
            templateId: 'tpl1',
            name: 'Pano-1',
            items: [{ productId: 'yok', quantity: 1 }],
          }),
        ),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
      } satisfies Partial<AppException>);
    });

    it('Teknik Ozellikler eksik urun icin PRODUCT_NOT_DRAWABLE firlatir', async () => {
      const prisma = createPrisma();
      prisma.quote.findFirst.mockResolvedValue({ id: 'q1' });
      prisma.product.findFirst.mockResolvedValue({
        id: 'p1',
        name: 'Eksik Urun',
        drawingSpec: null,
      });
      const service = new DrawingsService(prisma as never);
      await expect(
        runInTenant(() =>
          service.createFromProductSelection({
            quoteId: 'q1',
            templateId: 'tpl1',
            name: 'Pano-1',
            items: [{ productId: 'p1', quantity: 1 }],
          }),
        ),
      ).rejects.toMatchObject({
        code: 'PRODUCT_NOT_DRAWABLE',
      } satisfies Partial<AppException>);
    });

    it('kutuphanede olmayan komponent anahtari icin UNKNOWN_LIBRARY_COMPONENT firlatir', async () => {
      const prisma = createPrisma();
      prisma.quote.findFirst.mockResolvedValue({ id: 'q1' });
      prisma.product.findFirst.mockResolvedValue({
        id: 'p1',
        name: '3X1000A',
        drawingSpec: {
          widthMm: '150',
          heightMm: '200',
          libraryComponentKey: 'yok-komponent',
          bandKey: 'outgoing',
        },
      });
      prisma.drawingLibraryComponent.findFirst.mockResolvedValue(null);
      const service = new DrawingsService(prisma as never);
      await expect(
        runInTenant(() =>
          service.createFromProductSelection({
            quoteId: 'q1',
            templateId: 'tpl1',
            name: 'Pano-1',
            items: [{ productId: 'p1', quantity: 1 }],
          }),
        ),
      ).rejects.toMatchObject({
        code: 'UNKNOWN_LIBRARY_COMPONENT',
      } satisfies Partial<AppException>);
    });

    it('gecerli Product+spec+kutuphane ucgeninden Drawing uretir', async () => {
      const prisma = createPrisma();
      prisma.quote.findFirst.mockResolvedValue({ id: 'q1' });
      prisma.drawingPanelTemplate.findFirst.mockResolvedValue(TEMPLATE);
      prisma.product.findFirst.mockResolvedValue({
        id: 'p1',
        name: '3X1000A',
        drawingSpec: {
          widthMm: '150',
          heightMm: '200',
          libraryComponentKey: 'switch-compact',
          bandKey: 'outgoing',
        },
      });
      prisma.drawingLibraryComponent.findFirst.mockResolvedValue({
        key: 'switch-compact',
        category: 'SWITCH',
      });
      prisma.drawing.create.mockResolvedValue({ id: 'd1' });
      const service = new DrawingsService(prisma as never);
      await runInTenant(() =>
        service.createFromProductSelection({
          quoteId: 'q1',
          templateId: 'tpl1',
          name: 'Pano-1',
          panelGroupLabel: 'Pano 1',
          items: [{ productId: 'p1', quantity: 2 }],
        }),
      );
      expect(prisma.drawing.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          quoteId: 'q1',
          templateId: 'tpl1',
          name: 'Pano-1',
          panelGroupLabel: 'Pano 1',
          createdById: 'u1',
          model: expect.objectContaining({
            views: expect.objectContaining({
              internal: expect.objectContaining({
                elements: expect.arrayContaining([
                  expect.objectContaining({ label: '3X1000A' }),
                ]),
              }),
            }),
          }),
        }),
      });
      const createdModel = prisma.drawing.create.mock.calls[0][0].data.model;
      expect(createdModel.views.internal.elements).toHaveLength(2);
    });
  });

  describe('getById', () => {
    it('bulunamayan cizim icin NOT_FOUND firlatir', async () => {
      const prisma = createPrisma();
      const service = new DrawingsService(prisma as never);
      await expect(
        runInTenant(() => service.getById('yok')),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
      } satisfies Partial<AppException>);
    });
  });

  describe('update', () => {
    it('bulunamayan cizim icin NOT_FOUND firlatir', async () => {
      const prisma = createPrisma();
      const service = new DrawingsService(prisma as never);
      await expect(
        runInTenant(() => service.update('yok', { name: 'x' })),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
      } satisfies Partial<AppException>);
    });

    it('sadece verilen alanlari gunceller', async () => {
      const prisma = createPrisma();
      prisma.drawing.findFirst.mockResolvedValue({ id: 'd1' });
      prisma.drawing.update.mockResolvedValue({ id: 'd1', name: 'Yeni Ad' });
      const service = new DrawingsService(prisma as never);
      await runInTenant(() => service.update('d1', { name: 'Yeni Ad' }));
      expect(prisma.drawing.update).toHaveBeenCalledWith({
        where: { id: 'd1' },
        data: { name: 'Yeni Ad' },
      });
    });
  });

  describe('remove', () => {
    it('bulunamayan cizim icin NOT_FOUND firlatir', async () => {
      const prisma = createPrisma();
      const service = new DrawingsService(prisma as never);
      await expect(
        runInTenant(() => service.remove('yok')),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
      } satisfies Partial<AppException>);
    });

    it('var olan cizimi siler', async () => {
      const prisma = createPrisma();
      prisma.drawing.findFirst.mockResolvedValue({ id: 'd1' });
      const service = new DrawingsService(prisma as never);
      await runInTenant(() => service.remove('d1'));
      expect(prisma.drawing.delete).toHaveBeenCalledWith({
        where: { id: 'd1' },
      });
    });
  });
});
