import { Inject, Injectable } from '@nestjs/common';
import type { Drawing } from '@prisma/client';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { R2StorageService } from '../../core/storage/r2-storage.service';
import { DrawingPdfService } from './drawing-pdf.service';
import { DrawingsService } from './drawings.service';
import { renderDrawingModelToDxf } from './engine/dxf';
import { renderDrawingModel, renderDrawingView } from './engine/render-svg';
import type { DrawingModel, DrawingViewKey } from './engine/types';

/**
 * Faz D7: export HER ZAMAN `Drawing.model`'den (D4'teki `renderDrawingModel`) uretilir,
 * asla Fabric.js canvas ekran goruntusunden degil - render-svg.ts'teki yorumla birebir
 * ayni ilke (bkz. docs/VARSAYIMLAR.md V52/V55). PDF, urun gorseli/avatar ile ayni R2
 * deseniyle saklanir (Drawing.exportFileKey/exportedAt, D1'de bu amacla eklenmisti) -
 * dashboard/teklif PDF export'unun aksine (bkz. exports/quote-pdf.service.ts) burada
 * kalici bir dosya tutuluyor, cunku cizim PDF'i ucuncu taraflara (pano imalatcisi) tekrar
 * tekrar paylasilabilecek bir teslim dokumani; SVG tek-gorunum export'u ise ucuz ve saf
 * bir fonksiyon oldugu icin hic persist edilmeden anlik uretilir.
 */
@Injectable()
export class DrawingExportService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly drawings: DrawingsService,
    private readonly storage: R2StorageService,
    private readonly pdf: DrawingPdfService,
  ) {}

  async renderSvg(id: string, view: DrawingViewKey): Promise<string> {
    const drawing = await this.drawings.getById(id);
    const model = drawing.model as unknown as DrawingModel;
    return renderDrawingView(model, view);
  }

  /**
   * Faz D8: DXF de SVG ile ayni mantikla hic persist edilmeden anlik uretilir - saf,
   * determinist bir donusumun ciktisi (bkz. docs/VARSAYIMLAR.md V56). PDF'in aksine
   * (R2'de saklanan "resmi teslim dokumani") DXF bir CAD interop formati, her
   * istekte modelden yeniden uretilmesi maliyetsiz.
   */
  async renderDxf(id: string): Promise<string> {
    const drawing = await this.drawings.getById(id);
    const model = drawing.model as unknown as DrawingModel;
    return renderDrawingModelToDxf(model);
  }

  async exportPdf(id: string, tenantId: string): Promise<Drawing> {
    const drawing = await this.drawings.getById(id);
    const model = drawing.model as unknown as DrawingModel;
    const svgByView = renderDrawingModel(model);
    const pdfBuffer = await this.pdf.render(drawing.name, svgByView);

    const env =
      process.env.NODE_ENV === 'production' ? 'production' : 'development';
    const key = `PILENS/${env}/${tenantId}/drawings/${drawing.id}.pdf`;
    await this.storage.upload(key, pdfBuffer, 'application/pdf');

    return this.prisma.drawing.update({
      where: { id: drawing.id },
      data: { exportedAt: new Date(), exportFileKey: key },
    });
  }
}
