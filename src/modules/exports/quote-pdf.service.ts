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
// e-postasi + Pilens atif satiri) icin ayrilan alt marj - Playwright'in
// displayHeaderFooter alani bu marjin icine sigar. 3 satira kadar sarabilen
// adres + telefon/e-posta satiri + Pilens atif satiri icin yeterli.
const PDF_FOOTER_MARGIN_BOTTOM_MM = 28;
// Otomatik yukseklikte footer'in ortasina logo eklenince (bkz. footerShowLogo)
// logo yuksekligine ek olarak ayrilan bosluk (flex gap 4px ~= 1mm + pay).
const PDF_FOOTER_LOGO_GAP_MM = 2;
// Pilens atif satirinin sayfanin alt kenarindan uzakligi - footer yuksekliginden
// bagimsiz sabit (bkz. buildFooterTemplate).
const PDF_FOOTER_NOTICE_BOTTOM_MM = 3;
// Logo + "Fiyat Teklifi" basligi + tarih/teklif no satirinin sigmasi icin ayrilan
// ust marj (bkz. buildHeaderTemplate) - eskiden body icinde tek seferlik render
// edilen AppShell print header'inin yerini alir, artik her sayfada tekrar eder.
const PDF_HEADER_MARGIN_TOP = '26mm';
// Ust bilgi bandinin yuksekligi - sayfanin ust kenarina bitisik, renkli arka
// plan (headerBgColor) bu yukseklik boyunca boyanir; 26mm marjin kalan 4mm'si
// band ile teklif icerigi arasinda bosluk olarak kalir.
const PDF_HEADER_BAND_HEIGHT_MM = 22;

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
 * e-postasi yan yana, altinda Pilens atif satiri. Adres uzunsa en fazla 3
 * satira sarar (-webkit-line-clamp). Markali sablonun (quote-template-print-page.tsx)
 * kendi tasarimi var, bu footer SADECE sablonsuz/varsayilan yazdirma rotasinda
 * (`/teklifler/:id`) kullanilir. Atif satirindaki link PDF'e export edilince de
 * tiklanabilir kalir (Chromium, print-to-pdf sirasinda header/footer frame'indeki
 * <a> etiketlerini de PDF link annotation'ina cevirir). */
/** Standart PDF temasinin (bkz. docs/VARSAYIMLAR.md V89) header/footer'da
 * kullanilan alt kumesi - degerler backend'de HEX regex'iyle dogrulanmis
 * gelir, yine de HTML'e basmadan once escapeHtml'den gecirilir. */
export interface QuotePdfChromeColors {
  titleColor: string;
  textColor: string;
  headerBgColor: string;
  footerBgColor: string;
  footerTextColor: string;
  /** Sabit alt bilgi yuksekligi (mm), null = otomatik (icerik kadar). */
  footerHeightMm: number | null;
  /** Sirket logosu alt bilginin ortasinda (ust satir) gosterilsin mi. */
  footerShowLogo: boolean;
  /** Alt bilgideki logonun yuksekligi (mm). */
  footerLogoHeightMm: number;
}

const DEFAULT_CHROME_COLORS: QuotePdfChromeColors = {
  titleColor: '#8bc34a',
  textColor: '#16202e',
  headerBgColor: '#ffffff',
  footerBgColor: '#e8f5e9',
  footerTextColor: '#16202e',
  footerHeightMm: null,
  footerShowLogo: false,
  footerLogoHeightMm: 7,
};

/** PDF'in alt marji footer'in tamamini tasimali - sabit yukseklikte birebir o
 * deger, otomatikte eski 28mm (+ logo varsa ek pay). */
export function resolveFooterMarginMm(
  chrome: Pick<QuotePdfChromeColors, 'footerHeightMm' | 'footerLogoHeightMm'>,
  hasLogo: boolean,
): number {
  if (chrome.footerHeightMm !== null) return chrome.footerHeightMm;
  return (
    PDF_FOOTER_MARGIN_BOTTOM_MM +
    (hasLogo ? chrome.footerLogoHeightMm + PDF_FOOTER_LOGO_GAP_MM : 0)
  );
}

function buildFooterTemplate(
  company: {
    address: string | null;
    phone: string | null;
    email: string | null;
  },
  colors: QuotePdfChromeColors,
  logoDataUri: string | null,
): string {
  const logoRow = logoDataUri
    ? `<img src="${logoDataUri}" style="height:${colors.footerLogoHeightMm}mm;width:auto;object-fit:contain;display:block;" />`
    : '';
  const heightStyle =
    colors.footerHeightMm !== null
      ? `height:${colors.footerHeightMm}mm;overflow:hidden;`
      : '';
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
  const infoRow =
    cells.length > 0
      ? `<div style="flex-shrink:0;width:100%;display:flex;align-items:center;justify-content:center;gap:24px;">${cells.join('')}</div>`
      : '';
  // Pilens atif satiri her zaman footer'in (= sayfanin) en altinda, sabit bir
  // bosluk birakilarak durur; sirket bilgisi satiri (adres/telefon/e-posta) onun
  // hemen ustunde sabittir - footer yuksekligi artinca ikisi de yukari kaymaz.
  // Logo ustte kalan esnek alanda dikey ortalanir, sigmazsa sadece o kirpilir.
  const contentBlock = `<div style="flex:1 1 auto;min-height:0;overflow:hidden;width:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;">${logoRow}</div>`;
  const noticeRow = `<div style="flex-shrink:0;color:#2196f3;">Bu teklif, Pilens CRM platformu üzerinden hazırlanmıştır. <a href="https://www.pilens.com.tr" style="color:inherit;text-decoration:none;">www.pilens.com.tr</a></div>`;
  return `<div style="width:100%;box-sizing:border-box;${heightStyle}background:${escapeHtml(colors.footerBgColor)};padding:8px 10mm ${PDF_FOOTER_NOTICE_BOTTOM_MM}mm;display:flex;flex-direction:column;align-items:center;gap:4px;font-size:12px;color:${escapeHtml(colors.footerTextColor)};font-family:Arial,Helvetica,sans-serif;line-height:1.3;">${contentBlock}${infoRow}${noticeRow}</div>`;
}

/** AppShell print header'inin (app-shell.tsx) her sayfada tekrar eden esdegeri -
 * logo solda, "Fiyat Teklifi" basligi yaninda, tarih+teklif no sagda. Markali
 * sablonun kendi tasarimi var, bu header SADECE sablonsuz/varsayilan yazdirma
 * rotasinda kullanilir (bkz. render() icindeki isBrandedPath kontrolu).
 * `logoDataUri` zaten base64'e cevrilmis gelir (bkz. render() - Playwright'in
 * header/footer template frame'i sayfanin auth cookie'sini tasimadigindan,
 * `/files?key=...` gibi korumali bir URL buraya dogrudan verilirse logo
 * yuklenemez/kirik resim ikonu cikar). */
function buildHeaderTemplate(
  header: {
    logoDataUri: string | null;
    title: string;
    quoteDate: string;
    quoteNumber: string;
  },
  colors: QuotePdfChromeColors,
): string {
  const logo = header.logoDataUri
    ? `<img src="${header.logoDataUri}" style="height:44px;width:auto;object-fit:contain;display:block;" />`
    : '';
  return `<div style="width:100%;box-sizing:border-box;height:${PDF_HEADER_BAND_HEIGHT_MM}mm;background:${escapeHtml(colors.headerBgColor)};-webkit-print-color-adjust:exact;display:flex;align-items:center;justify-content:space-between;padding:8px 10mm;font-family:Arial,Helvetica,sans-serif;">
    <div style="display:flex;align-items:center;gap:12px;">
      ${logo}
      <span style="font-size:20px;font-weight:bold;color:${escapeHtml(colors.titleColor)};">${escapeHtml(header.title)}</span>
    </div>
    <div style="text-align:right;font-size:11px;font-weight:bold;color:${escapeHtml(colors.textColor)};line-height:1.5;">
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
      /** Standart PDF temasi (header basligi/footer renkleri) - verilmezse
       * eski sabit renkler kullanilir. */
      colors?: QuotePdfChromeColors;
    },
  ): Promise<Buffer> {
    const colors = options?.colors ?? DEFAULT_CHROME_COLORS;
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
      const logoDataUri =
        !isBrandedPath && options?.header?.logoUrl
          ? await fetchAsDataUri(context.request, options.header.logoUrl)
          : null;
      const footerLogoDataUri = colors.footerShowLogo ? logoDataUri : null;
      const footerTemplate =
        !isBrandedPath && options?.company
          ? buildFooterTemplate(options.company, colors, footerLogoDataUri)
          : '<div></div>';
      let headerTemplate = '<div></div>';
      if (!isBrandedPath && options?.header) {
        headerTemplate = buildHeaderTemplate(
          { ...options.header, logoDataUri },
          colors,
        );
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
              : `${resolveFooterMarginMm(colors, Boolean(footerLogoDataUri))}mm`,
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
