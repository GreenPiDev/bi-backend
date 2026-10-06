import { AppException } from '../../core/errors/app.exception';
import { DrawingImportsService } from './drawing-imports.service';

function createPrisma() {
  return {
    quote: { findFirst: vi.fn().mockResolvedValue(null) },
    product: { findMany: vi.fn().mockResolvedValue([]) },
  };
}

function createPdfTextExtractor(text = 'pdf metni') {
  return { extractText: vi.fn().mockResolvedValue(text) };
}

function createAiLineMatcher(lines: unknown[] = []) {
  return { matchLines: vi.fn().mockResolvedValue(lines) };
}

function createDrawingsService() {
  return {
    createFromProductSelection: vi.fn().mockResolvedValue({ id: 'd1' }),
  };
}

const DRAWABLE_PRODUCT = {
  id: 'p1',
  name: 'Kesici 3X1000A',
  sku: 'SKU-1',
  drawingSpec: {
    widthMm: '150',
    heightMm: '200',
    libraryComponentKey: 'switch-compact',
    bandKey: 'outgoing',
  },
};

describe('DrawingImportsService', () => {
  describe('previewFromPdf', () => {
    it('bulunamayan teklif icin NOT_FOUND firlatir', async () => {
      const prisma = createPrisma();
      const service = new DrawingImportsService(
        prisma as never,
        createPdfTextExtractor() as never,
        createAiLineMatcher() as never,
        createDrawingsService() as never,
      );
      await expect(
        service.previewFromPdf('yok', Buffer.from('x')),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
      } satisfies Partial<AppException>);
    });

    it('cizilebilir urun yoksa NO_DRAWABLE_PRODUCTS firlatir', async () => {
      const prisma = createPrisma();
      prisma.quote.findFirst.mockResolvedValue({ id: 'q1' });
      prisma.product.findMany.mockResolvedValue([
        { id: 'p2', name: 'Eksik Urun', sku: null, drawingSpec: null },
      ]);
      const service = new DrawingImportsService(
        prisma as never,
        createPdfTextExtractor() as never,
        createAiLineMatcher() as never,
        createDrawingsService() as never,
      );
      await expect(
        service.previewFromPdf('q1', Buffer.from('x')),
      ).rejects.toMatchObject({
        code: 'NO_DRAWABLE_PRODUCTS',
      } satisfies Partial<AppException>);
    });

    it('AI onerilerini cizilebilir urun katalogu ile zenginlestirip doner', async () => {
      const prisma = createPrisma();
      prisma.quote.findFirst.mockResolvedValue({ id: 'q1' });
      prisma.product.findMany.mockResolvedValue([DRAWABLE_PRODUCT]);
      const aiLineMatcher = createAiLineMatcher([
        {
          rawLine: 'ABB kesici - Adet: 2',
          panelGroupLabel: 'Pano 1',
          productId: 'p1',
          quantity: 2,
          confidence: 0.9,
        },
      ]);
      const service = new DrawingImportsService(
        prisma as never,
        createPdfTextExtractor() as never,
        aiLineMatcher as never,
        createDrawingsService() as never,
      );
      const result = await service.previewFromPdf('q1', Buffer.from('x'));
      expect(result.lines).toHaveLength(1);
      expect(result.lines[0]).toMatchObject({
        productId: 'p1',
        productName: 'Kesici 3X1000A',
        needsReview: false,
      });
    });

    it('katalogda olmayan (hallucinate edilmis) productId null"a cevrilir ve needsReview true olur', async () => {
      const prisma = createPrisma();
      prisma.quote.findFirst.mockResolvedValue({ id: 'q1' });
      prisma.product.findMany.mockResolvedValue([DRAWABLE_PRODUCT]);
      const aiLineMatcher = createAiLineMatcher([
        {
          rawLine: 'bilinmeyen satir',
          panelGroupLabel: 'Pano 1',
          productId: 'katalogda-olmayan-id',
          quantity: 1,
          confidence: 0.9,
        },
      ]);
      const service = new DrawingImportsService(
        prisma as never,
        createPdfTextExtractor() as never,
        aiLineMatcher as never,
        createDrawingsService() as never,
      );
      const result = await service.previewFromPdf('q1', Buffer.from('x'));
      expect(result.lines[0].productId).toBeNull();
      expect(result.lines[0].needsReview).toBe(true);
    });

    it('dusuk confidence needsReview=true isaretler', async () => {
      const prisma = createPrisma();
      prisma.quote.findFirst.mockResolvedValue({ id: 'q1' });
      prisma.product.findMany.mockResolvedValue([DRAWABLE_PRODUCT]);
      const aiLineMatcher = createAiLineMatcher([
        {
          rawLine: 'belirsiz satir',
          panelGroupLabel: 'Pano 1',
          productId: 'p1',
          quantity: 1,
          confidence: 0.3,
        },
      ]);
      const service = new DrawingImportsService(
        prisma as never,
        createPdfTextExtractor() as never,
        aiLineMatcher as never,
        createDrawingsService() as never,
      );
      const result = await service.previewFromPdf('q1', Buffer.from('x'));
      expect(result.lines[0].needsReview).toBe(true);
    });
  });

  describe('commit', () => {
    it('her panelGroupLabel grubu icin ayri bir Drawing olusturur (1 Quote -> N Drawing)', async () => {
      const prisma = createPrisma();
      const drawingsService = createDrawingsService();
      drawingsService.createFromProductSelection
        .mockResolvedValueOnce({ id: 'd1' })
        .mockResolvedValueOnce({ id: 'd2' });
      const service = new DrawingImportsService(
        prisma as never,
        createPdfTextExtractor() as never,
        createAiLineMatcher() as never,
        drawingsService as never,
      );
      const result = await service.commit({
        quoteId: 'q1',
        templateId: 'tpl1',
        groups: [
          {
            panelGroupLabel: 'Pano 1',
            name: 'Pano 1 Cizimi',
            items: [{ productId: 'p1', quantity: 2 }],
          },
          {
            panelGroupLabel: 'Pano 2',
            name: 'Pano 2 Cizimi',
            items: [{ productId: 'p2', quantity: 1 }],
          },
        ],
      });
      expect(result).toHaveLength(2);
      expect(drawingsService.createFromProductSelection).toHaveBeenCalledTimes(
        2,
      );
      expect(
        drawingsService.createFromProductSelection,
      ).toHaveBeenNthCalledWith(1, {
        quoteId: 'q1',
        templateId: 'tpl1',
        name: 'Pano 1 Cizimi',
        panelGroupLabel: 'Pano 1',
        items: [{ productId: 'p1', quantity: 2 }],
      });
    });
  });
});
