import { DrawingExportService } from './drawing-export.service';

const DRAWING_ID = '11111111-1111-4111-8111-111111111111';

function createModel() {
  return {
    plateWidthMm: 1000,
    plateHeightMm: 2000,
    views: {
      internal: { elements: [] },
      coverPlate: { elements: [] },
      external: { elements: [] },
    },
    busbars: [],
  };
}

function createDrawing(overrides: Record<string, unknown> = {}) {
  return {
    id: DRAWING_ID,
    name: 'Pano-1',
    model: createModel(),
    exportedAt: null,
    exportFileKey: null,
    ...overrides,
  };
}

function createDrawingsService(drawing = createDrawing()) {
  return { getById: vi.fn().mockResolvedValue(drawing) };
}

function createStorage() {
  return { upload: vi.fn().mockResolvedValue(undefined) };
}

function createPdf() {
  return { render: vi.fn().mockResolvedValue(Buffer.from('pdf-bytes')) };
}

function createPrisma(updated: Record<string, unknown>) {
  return { drawing: { update: vi.fn().mockResolvedValue(updated) } };
}

describe('DrawingExportService', () => {
  describe('renderSvg', () => {
    it("belirtilen gorunumun SVG'sini doner", async () => {
      const drawings = createDrawingsService();
      const service = new DrawingExportService(
        createPrisma({}) as never,
        drawings as never,
        createStorage() as never,
        createPdf() as never,
      );
      const svg = await service.renderSvg(DRAWING_ID, 'internal');
      expect(svg).toContain('<svg');
      expect(drawings.getById).toHaveBeenCalledWith(DRAWING_ID);
    });
  });

  describe('renderDxf', () => {
    it('modelden bir DXF govdesi doner', async () => {
      const drawings = createDrawingsService();
      const service = new DrawingExportService(
        createPrisma({}) as never,
        drawings as never,
        createStorage() as never,
        createPdf() as never,
      );
      const dxf = await service.renderDxf(DRAWING_ID);
      expect(dxf).toContain('SECTION');
      expect(dxf.trimEnd().endsWith('0\nEOF')).toBe(true);
      expect(drawings.getById).toHaveBeenCalledWith(DRAWING_ID);
    });
  });

  describe('exportPdf', () => {
    it('PDF uretir, R2ye yukler ve Drawing kaydini exportedAt/exportFileKey ile gunceller', async () => {
      const drawing = createDrawing();
      const drawings = createDrawingsService(drawing);
      const storage = createStorage();
      const pdf = createPdf();
      const updatedDrawing = createDrawing({
        exportedAt: new Date(),
        exportFileKey: 'PILENS/development/t1/drawings/' + DRAWING_ID + '.pdf',
      });
      const prisma = createPrisma(updatedDrawing);

      const service = new DrawingExportService(
        prisma as never,
        drawings as never,
        storage as never,
        pdf as never,
      );
      const result = await service.exportPdf(DRAWING_ID, 't1');

      expect(pdf.render).toHaveBeenCalledWith(
        'Pano-1',
        expect.objectContaining({
          internal: expect.any(String),
          coverPlate: expect.any(String),
          external: expect.any(String),
        }),
      );
      expect(storage.upload).toHaveBeenCalledWith(
        `PILENS/development/t1/drawings/${DRAWING_ID}.pdf`,
        Buffer.from('pdf-bytes'),
        'application/pdf',
      );
      expect(prisma.drawing.update).toHaveBeenCalledWith({
        where: { id: DRAWING_ID },
        data: {
          exportedAt: expect.any(Date),
          exportFileKey: `PILENS/development/t1/drawings/${DRAWING_ID}.pdf`,
        },
      });
      expect(result).toBe(updatedDrawing);
    });
  });
});
