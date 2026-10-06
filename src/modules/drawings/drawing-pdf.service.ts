import { Injectable } from '@nestjs/common';
import { chromium } from 'playwright';
import { DRAWING_VIEW_KEYS, type DrawingViewKey } from './engine/types';

const VIEW_LABELS: Record<DrawingViewKey, string> = {
  internal: 'İç Görünüş',
  coverPlate: 'Örtü Plakalı Görünüş',
  external: 'Dış Görünüş',
};

function buildHtml(
  drawingName: string,
  svgByView: Record<DrawingViewKey, string>,
): string {
  const sections = DRAWING_VIEW_KEYS.map(
    (view, index) => `
      <section style="${index > 0 ? 'page-break-before: always;' : ''} padding: 16px;">
        <h2 style="font-family: Arial, Helvetica, sans-serif; font-size: 14px; margin-bottom: 8px;">
          ${drawingName} — ${VIEW_LABELS[view]}
        </h2>
        ${svgByView[view]}
      </section>`,
  ).join('');
  return `<!doctype html><html><head><meta charset="utf-8" /></head><body>${sections}</body></html>`;
}

/**
 * Faz D7: `quote-pdf.service.ts`/`dashboard-pdf.service.ts` ile ayni desen -
 * Playwright'in gercek bir tarayici baslattigi, bu yuzden (o iki serviste de oldugu
 * gibi) bilerek unit test edilmeyen tek sorumluluk. Tek fark: dashboard/teklif export'u
 * CANLI frontend sayfasini (auth cookie ile) render eder, burada ise HTML tamamen
 * statik ve kimlik dogrulama GEREKMEZ - girdi zaten sunucu tarafinda `renderDrawingModel`
 * (D4) ile uretilmis SVG metni, ekran goruntusu degil (bkz. docs/VARSAYIMLAR.md V52/V55).
 */
@Injectable()
export class DrawingPdfService {
  async render(
    drawingName: string,
    svgByView: Record<DrawingViewKey, string>,
  ): Promise<Buffer> {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.setContent(buildHtml(drawingName, svgByView), {
        waitUntil: 'load',
      });
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' },
      });
      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }
}
