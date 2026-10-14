import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { chromium, type APIRequestContext } from 'playwright';
import { ACCESS_TOKEN_COOKIE } from '../auth/token.types';

const RENDER_SETTLE_MS = 300;
// Maliyet/Grafikler tab'lari ECharts pasta grafigi render ediyor (asenkron/animasyonlu,
// bkz. DashboardPdfService'teki ayni gerekce) - sabit teklif metin/tablosundan daha uzun
// bir bekleme gerekiyor.
const CHARTS_RENDER_SETTLE_MS = 1200;
const PDF_CONTENT_WIDTH_PX = 718;
// Maliyet tab'i 11 kolonlu genis bir tablo (bkz. quote-cost-content.tsx) - dikey A4'te
// kolonlar sikisiyordu, bu yuzden bu export yatay (landscape) alinir. A4 yatay (297mm)
// eksi sol+sag 10mm marj = 277mm kullanilabilir fiziksel genislik, 96dpi'da px'e cevrilir.
const LANDSCAPE_CONTENT_WIDTH_PX = 1046;
// Tablo (Table bileseni table-layout:fixed kullaniyor) sadece LANDSCAPE_CONTENT_WIDTH_PX
// kadar bir viewport'ta hala sikisiyordu (kolonlarin toplam sabit genisligi bu degeri
// asiyor, bkz. kullanici ekran goruntusu) - gercek tarayicida (genis masaustu ekraninda)
// goruldugu gibi rahat yerlesmesi icin DAHA GENIS bir viewport'ta render edilir, sonra
// `scale` ile fiziksel sayfaya sigacak sekilde kucultulur (gercek tarayicinin "yazdir,
// sayfaya sigdir" davranisiyla ayni mantik - layout degismez, sadece ciktida olceklenir).
const COST_RENDER_WIDTH_PX = 1400;
const COST_PDF_SCALE = LANDSCAPE_CONTENT_WIDTH_PX / COST_RENDER_WIDTH_PX;
const PDF_VIEWPORT_HEIGHT_PX = 1200;
// Her sayfanin altinda tekrar eden acik yesil footer (sirket adresi/telefon/
// e-postasi) icin ayrilan alt marj - Playwright'in displayHeaderFooter alani
// bu marjin icine sigar. 3 satira kadar sarabilen adres + tek satirlik
// telefon/e-posta icin yeterli.
const PDF_FOOTER_MARGIN_BOTTOM = '24mm';
// Logo + "Fiyat Teklifi" basligi + tarih/teklif no satirinin sigmasi icin ayrilan
// ust marj (bkz. buildHeaderTemplate) - eskiden body icinde tek seferlik render
// edilen AppShell print header'inin yerini alir, artik her sayfada tekrar eder.
const PDF_HEADER_MARGIN_TOP = '26mm';

/** Playwright'in header/footer template frame'i, asil sayfanin auth cookie'sini
 * tasimaz - korumali bir `/files?key=...` URL'i oraya dogrudan verilirse logo
 * yuklenemez (kirik resim ikonu). Cozum: gorseli, zaten cookie'yi tasiyan AYNI
 * browser context'inin `request` API'siyle fetch'leyip base64 data URI'ye
 * cevirmek - bkz. buildHeaderTemplate doc comment'i. */
async function fetchAsDataUri(
  request: APIRequestContext,
  url: string,
): Promise<string | null> {
  try {
    const response = await request.get(url);
    if (!response.ok()) return null;
    const buffer = await response.body();
    const contentType = response.headers()['content-type'] ?? 'image/png';
    return `data:${contentType};base64,${buffer.toString('base64')}`;
  } catch {
    return null;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Acik yesil, kagida bitisik (tam genislik) footer - sirket adresi/telefon/
 * e-postasi yan yana. Adres uzunsa en fazla 3 satira sarar (-webkit-line-clamp).
 * Markali sablonun (quote-template-print-page.tsx) kendi tasarimi var, bu footer
 * SADECE sablonsuz/varsayilan yazdirma rotasinda (`/teklifler/:id`) kullanilir. */
function buildFooterTemplate(company: {
  address: string | null;
  phone: string | null;
  email: string | null;
}): string {
  const cells: string[] = [];
  if (company.address) {
    cells.push(
      `<div style="max-width:45%;overflow:hidden;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;">${escapeHtml(company.address)}</div>`,
    );
  }
  if (company.phone) {
    cells.push(
      `<div style="white-space:nowrap;">${escapeHtml(company.phone)}</div>`,
    );
  }
  if (company.email) {
    cells.push(
      `<div style="white-space:nowrap;">${escapeHtml(company.email)}</div>`,
    );
  }
  if (cells.length === 0) {
    return '<div></div>';
  }
  return `<div style="width:100%;box-sizing:border-box;background:#e8f5e9;padding:8px 10mm;display:flex;align-items:center;justify-content:center;gap:24px;font-size:12px;color:#16202e;font-family:Arial,Helvetica,sans-serif;line-height:1.3;">${cells.join('')}</div>`;
}

/** AppShell print header'inin (app-shell.tsx) her sayfada tekrar eden esdegeri -
 * logo solda, "Fiyat Teklifi" basligi yaninda, tarih+teklif no sagda. Markali
 * sablonun kendi tasarimi var, bu header SADECE sablonsuz/varsayilan yazdirma
 * rotasinda kullanilir (bkz. render() icindeki isBrandedPath kontrolu).
 * `logoDataUri` zaten base64'e cevrilmis gelir (bkz. render() - Playwright'in
 * header/footer template frame'i sayfanin auth cookie'sini tasimadigindan,
 * `/files?key=...` gibi korumali bir URL buraya dogrudan verilirse logo
 * yuklenemez/kirik resim ikonu cikar). */
function buildHeaderTemplate(header: {
  logoDataUri: string | null;
  title: string;
  quoteDate: string;
  quoteNumber: string;
}): string {
  const logo = header.logoDataUri
    ? `<img src="${header.logoDataUri}" style="height:44px;width:auto;object-fit:contain;display:block;" />`
    : '';
  return `<div style="width:100%;box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;padding:8px 10mm;font-family:Arial,Helvetica,sans-serif;">
    <div style="display:flex;align-items:center;gap:12px;">
      ${logo}
      <span style="font-size:20px;font-weight:bold;color:#8bc34a;">${escapeHtml(header.title)}</span>
    </div>
    <div style="text-align:right;font-size:11px;font-weight:bold;color:#16202e;line-height:1.5;">
      <div>${escapeHtml(header.quoteDate)}</div>
      <div># ${escapeHtml(header.quoteNumber)}</div>
    </div>
  </div>`;
}

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
    options?: {
      branded?: boolean;
      tab?: 'cost' | 'charts';
      /** Sadece sablonsuz/varsayilan rotada footer'a basilir - bkz.
       * buildFooterTemplate doc comment'i. */
      company?: {
        address: string | null;
        phone: string | null;
        email: string | null;
      };
      /** Sadece sablonsuz/varsayilan rotada header'a basilir - bkz.
       * buildHeaderTemplate doc comment'i. */
      header?: {
        logoUrl: string | null;
        title: string;
        quoteDate: string;
        quoteNumber: string;
      };
    },
  ): Promise<Buffer> {
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
    const isLandscape = options?.tab === 'cost';
    const browser = await chromium.launch();
    try {
      const context = await browser.newContext({
        viewport: {
          width: isLandscape ? COST_RENDER_WIDTH_PX : PDF_CONTENT_WIDTH_PX,
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
      /**
       * Ad-hoc (bkz. docs/VARSAYIMLAR.md V41): teklifin bir QuoteTemplate'i varsa
       * markali cok sayfali yazdirma rotasina (quote-template-print-page.tsx)
       * gidilir; yoksa DEGISMEYEN mevcut sade rota kullanilir - baska hicbir PDF
       * export'u (dashboard, sablonsuz teklif) bu daldan etkilenmez. `tab` verilince
       * (Maliyet/Grafikler) markali rota degil, her zaman duz /teklifler/:id rotasi
       * `?tab=` ile kullanilir - bu iki tab'in kendi markali sablonu yok.
       */
      const isBrandedPath = Boolean(options?.branded && !options.tab);
      const printPath = isBrandedPath
        ? `/teklifler/${quoteId}/sablon-baski`
        : `/teklifler/${quoteId}`;
      const tabQuery = options?.tab ? `&tab=${options.tab}` : '';
      await page.goto(`${frontendUrl}${printPath}?print=1${tabQuery}`, {
        waitUntil: 'networkidle',
      });
      await page.waitForTimeout(
        options?.tab === 'charts' ? CHARTS_RENDER_SETTLE_MS : RENDER_SETTLE_MS,
      );
      // Footer/header sadece sablonsuz/varsayilan rotada basilir (bkz.
      // buildFooterTemplate/buildHeaderTemplate doc comment'leri) - markali
      // sablonun kendi tasarimi var.
      const footerTemplate =
        !isBrandedPath && options?.company
          ? buildFooterTemplate(options.company)
          : '<div></div>';
      let headerTemplate = '<div></div>';
      if (!isBrandedPath && options?.header) {
        const logoDataUri = options.header.logoUrl
          ? await fetchAsDataUri(context.request, options.header.logoUrl)
          : null;
        headerTemplate = buildHeaderTemplate({
          ...options.header,
          logoDataUri,
        });
      }
      const pdf = await page.pdf({
        format: 'A4',
        landscape: isLandscape,
        scale: isLandscape ? COST_PDF_SCALE : undefined,
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate,
        footerTemplate,
        margin: {
          top:
            headerTemplate === '<div></div>' ? '12mm' : PDF_HEADER_MARGIN_TOP,
          bottom:
            footerTemplate === '<div></div>'
              ? '12mm'
              : PDF_FOOTER_MARGIN_BOTTOM,
          left: '10mm',
          right: '10mm',
        },
      });
      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }
}
