import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { chromium } from 'playwright';
import { ACCESS_TOKEN_COOKIE } from '../auth/token.types';

const RENDER_SETTLE_MS = 300;
const PDF_CONTENT_WIDTH_PX = 718;
const PDF_VIEWPORT_HEIGHT_PX = 1200;

/** Q6: DashboardPdfService ile ayni desen (bkz. docs/VARSAYIMLAR.md V27) - canli
 * frontend'i, kullanicinin kisa omurlu bir erisim token'iyla headless tarayicida
 * render edip PDF'e cevirir. Teklif sabit bir tablo/metin sayfasi oldugundan
 * (ECharts gibi asenkron grafik animasyonu yok) daha kisa bir bekleme yeterli. */
@Injectable()
export class QuotePdfService {
  constructor(private readonly config: ConfigService) {}

  async render(
    quoteId: string,
    accessToken: string,
    options?: { branded?: boolean },
  ): Promise<Buffer> {
    const frontendUrl = this.config.getOrThrow<string>('FRONTEND_URL');
    const browser = await chromium.launch();
    try {
      const context = await browser.newContext({
        viewport: {
          width: PDF_CONTENT_WIDTH_PX,
          height: PDF_VIEWPORT_HEIGHT_PX,
        },
      });
      await context.addCookies([
        {
          name: ACCESS_TOKEN_COOKIE,
          value: accessToken,
          url: frontendUrl,
        },
      ]);
      const page = await context.newPage();
      /**
       * Ad-hoc (bkz. docs/VARSAYIMLAR.md V41): teklifin bir QuoteTemplate'i varsa
       * markali cok sayfali yazdirma rotasina (quote-template-print-page.tsx)
       * gidilir; yoksa DEGISMEYEN mevcut sade rota kullanilir - baska hicbir PDF
       * export'u (dashboard, sablonsuz teklif) bu daldan etkilenmez.
       */
      const printPath = options?.branded
        ? `/teklifler/${quoteId}/sablon-baski`
        : `/teklifler/${quoteId}`;
      await page.goto(`${frontendUrl}${printPath}?print=1`, {
        waitUntil: 'networkidle',
      });
      await page.waitForTimeout(RENDER_SETTLE_MS);
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '12mm', bottom: '12mm', left: '10mm', right: '10mm' },
      });
      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }
}
