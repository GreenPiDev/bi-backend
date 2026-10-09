import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { chromium } from 'playwright';
import { ACCESS_TOKEN_COOKIE } from '../auth/token.types';

const RENDER_SETTLE_MS = 1200;
// A4 yatay (297mm) eksi sol+sag 10mm marj = 277mm kullanilabilir fiziksel genislik,
// 96dpi'da px'e cevrilir - bkz. QuotePdfService'teki ayni gerekce (Maliyet tab'i da yatay).
const LANDSCAPE_CONTENT_WIDTH_PX = 1046;
// Pasta grafiklerin (bkz. query-result-to-echarts-option.ts buildPieOptionFromPoints)
// lejant/dilim yerlesimi yuzdesel container genisligine gore hesaplaniyor - dar bir
// viewport'ta (1046px) web'de hic gorulmeyen bir bicimde lejant pasta diliminin uzerine
// biniyor. QuotePdfService'teki Maliyet tab'i tablo cozumuyle ayni mantik: GENIS bir
// viewport'ta (gercek masaustu genisliginde, web'de goruldugu gibi) render edip sonra
// `scale` ile fiziksel sayfaya sigacak sekilde kucultuyoruz - layout degismiyor, sadece
// ciktida olceklenir.
const REPORT_RENDER_WIDTH_PX = 1400;
const REPORT_PDF_SCALE = LANDSCAPE_CONTENT_WIDTH_PX / REPORT_RENDER_WIDTH_PX;
const PDF_VIEWPORT_HEIGHT_PX = 1200;

export const REPORT_TABS = [
  'accounts',
  'contacts',
  'interactions',
  'projects',
  'quotes',
  'purchaseOrders',
  'opportunities',
] as const;

export type ReportTab = (typeof REPORT_TABS)[number];

export function isKnownReportTab(value: string): value is ReportTab {
  return (REPORT_TABS as readonly string[]).includes(value);
}

/** /raporlar sayfasinin tab'a ozel PDF export'u - DashboardPdfService/QuotePdfService ile
 * ayni desen (bkz. docs/VARSAYIMLAR.md): canli frontend'i, kisa omurlu bir erisim token'i
 * cerez olarak enjekte edilerek headless tarayicida render edip PDF'e cevirir. `/raporlar`
 * print modunda HorizontalTabPanel'i tamamen atlayip sadece aktif tab'in icerigini basar
 * (bkz. bi-frontend reports-page.tsx), bu yuzden burada ek bir "tab'i tikla" adimi yok. */
@Injectable()
export class ReportPdfService {
  constructor(private readonly config: ConfigService) {}

  async render(tab: ReportTab, accessToken: string): Promise<Buffer> {
    const frontendUrl = this.config.getOrThrow<string>('FRONTEND_URL');
    const apiOrigin = new URL(this.config.getOrThrow<string>('API_PUBLIC_URL'))
      .origin;
    const secure = process.env.NODE_ENV === 'production';
    const browser = await chromium.launch();
    try {
      const context = await browser.newContext({
        viewport: {
          width: REPORT_RENDER_WIDTH_PX,
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
      await page.goto(`${frontendUrl}/raporlar?print=1&tab=${tab}`, {
        waitUntil: 'networkidle',
      });
      await page.waitForTimeout(RENDER_SETTLE_MS);
      const pdf = await page.pdf({
        format: 'A4',
        landscape: true,
        scale: REPORT_PDF_SCALE,
        printBackground: true,
        margin: { top: '12mm', bottom: '12mm', left: '10mm', right: '10mm' },
      });
      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }
}
