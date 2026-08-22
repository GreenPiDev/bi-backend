import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { chromium } from 'playwright';
import { ACCESS_TOKEN_COOKIE } from '../auth/token.types';

const RENDER_SETTLE_MS = 1200;

@Injectable()
export class DashboardPdfService {
  constructor(private readonly config: ConfigService) {}

  /** Panoyu gercek frontend'de, gercek kullanicinin oturumuyla (kisa omurlu bir erisim
   * token'i cerez olarak enjekte edilerek) headless tarayicida render edip PDF'e cevirir.
   * ECharts grafikleri asenkron/animasyonlu render ettiginden sabit bir bekleme suresi
   * eklenir (bkz. docs/VARSAYIMLAR.md). */
  async render(dashboardId: string, accessToken: string): Promise<Buffer> {
    const frontendUrl = this.config.getOrThrow<string>('FRONTEND_URL');
    const browser = await chromium.launch();
    try {
      const context = await browser.newContext();
      await context.addCookies([
        {
          name: ACCESS_TOKEN_COOKIE,
          value: accessToken,
          url: frontendUrl,
        },
      ]);
      const page = await context.newPage();
      // ?print=1 -> DashboardViewPage/AppShell navigasyonu, aksiyon butonlarini,
      // filtre cubugunu ve chatbot widget'ini gizleyip sade bir rapor gorunumune
      // gecer (bkz. bi-frontend app-shell.tsx / dashboard-view-page.tsx).
      await page.goto(`${frontendUrl}/dashboards/${dashboardId}?print=1`, {
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
