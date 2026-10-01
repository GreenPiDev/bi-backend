import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { chromium } from 'playwright';
import { ACCESS_TOKEN_COOKIE } from '../auth/token.types';

const RENDER_SETTLE_MS = 1200;
// A4 (210mm) eksi sol+sag 10mm marj = 190mm kullanilabilir genislik, 96dpi'da px'e
// cevrilir (190 * 96 / 25.4). Playwright'a masaustu genisliginde (ör. 1500px+) render
// ettirip PDF'e oldugu gibi kirptirmak yerine, DOM'u bastan bu dar genislikte actiriyoruz
// ki react-grid-layout (useContainerWidth) widget'lari zaten bu genisligi baz alarak
// yerlestirsin - aksi halde 3 grafik yan yana koyulan panolarda sayfa disina tasan
// bir widget PDF'te kirpiliyordu.
const PDF_CONTENT_WIDTH_PX = 718;
const PDF_VIEWPORT_HEIGHT_PX = 1200;

@Injectable()
export class DashboardPdfService {
  constructor(private readonly config: ConfigService) {}

  /** Panoyu gercek frontend'de, gercek kullanicinin oturumuyla (kisa omurlu bir erisim
   * token'i cerez olarak enjekte edilerek) headless tarayicida render edip PDF'e cevirir.
   * ECharts grafikleri asenkron/animasyonlu render ettiginden sabit bir bekleme suresi
   * eklenir (bkz. docs/VARSAYIMLAR.md). */
  async render(dashboardId: string, accessToken: string): Promise<Buffer> {
    const frontendUrl = this.config.getOrThrow<string>('FRONTEND_URL');
    // Auth cookie'si backend tarafindan domain belirtilmeden set edilir (bkz.
    // set-auth-cookies.ts), yani gercek tarayicida API'nin kendi origin'ine
    // scope'lanir - frontend buraya credentials:'include' ile cross-site fetch atar.
    // Playwright'a enjekte edilen cookie de ayni origin'e (frontendUrl'e DEGIL)
    // bagli olmali, yoksa /auth/me 401 doner ve sayfa /login'e redirect olur.
    const apiOrigin = new URL(this.config.getOrThrow<string>('API_PUBLIC_URL'))
      .origin;
    // set-auth-cookies.ts ile ayni kural: prod'da frontend (Vercel/pilens.com.tr) ve
    // API farkli origin'lerde oldugundan SameSite=None+Secure sart, aksi halde
    // Chromium cookie'yi cross-site fetch'lerde sessizce atar (addCookies varsayilani
    // Lax'tir, buraya ozellikle yazilmazsa ayni bug domain duzeltmesine ragmen surer).
    const secure = process.env.NODE_ENV === 'production';
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
          url: apiOrigin,
          secure,
          sameSite: secure ? 'None' : 'Lax',
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
