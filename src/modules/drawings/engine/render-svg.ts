import type { DrawingModel, DrawingViewKey } from './types';

/**
 * THE renderer: DrawingModel -> SVG. proje-1'in "tek renderer" ilkesiyle ayni (bkz.
 * web/src/render/toSvg.ts): salt-okunur onizleme VE gelecekteki PDF/SVG export (Faz
 * D7) ayni bu fonksiyonu kullanacak - export asla canvas/ekran goruntusunden degil,
 * HER ZAMAN bu modelden uretilir (bi-backend-drawing-module-prompt.md).
 */

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Metnin kutu disina tasmadan sigmasi icin punto (mm) - proje-1'in fitFontSize'iyla
 * ayni mantik (genislik/yukseklige gore sinirlanmis, okunabilir araliga kenetlenmis). */
function fitFontSize(text: string, widthMm: number, heightMm: number): number {
  const len = Math.max(1, text.length);
  const byWidth = (0.85 * widthMm) / (len * 0.62);
  return Math.max(2.5, Math.min(byWidth, 0.45 * heightMm, 10));
}

function renderCenteredText(
  text: string,
  cx: number,
  cy: number,
  fontSizeMm: number,
): string {
  return `<text x="${cx}" y="${cy}" font-size="${fontSizeMm.toFixed(2)}" text-anchor="middle" dominant-baseline="central">${escapeXml(text)}</text>`;
}

/** Referans AG pano gorsellerindeki bara rengi (turuncu/bakir). */
const BUSBAR_COLOR = '#d97706';

function renderView(model: DrawingModel, viewKey: DrawingViewKey): string {
  const view = model.views[viewKey];
  const parts: string[] = [];

  parts.push(
    `<rect x="0" y="0" width="${model.plateWidthMm}" height="${model.plateHeightMm}" fill="#fafafa" stroke="#000" stroke-width="0.8"/>`,
  );

  // Bara sadece ic gorunuste cizilir - orju plakali/dis gorunus barayi gostermez
  // (gercek AG pano referans gorselleriyle tutarli, bkz. docs/VARSAYIMLAR.md V52).
  if (viewKey === 'internal') {
    for (const bar of model.busbars) {
      parts.push(
        `<line x1="${bar.startX}" y1="${bar.startY}" x2="${bar.endX}" y2="${bar.endY}" stroke="${BUSBAR_COLOR}" stroke-width="${bar.thicknessMm}" data-id="${bar.id}"/>`,
      );
    }
  }

  for (const el of view.elements) {
    // Etiket, kullanici editorde ayrica tasimis/boyutlandirmissa (labelX/Y/
    // labelWidthMm/labelFontSizeMm) o konum/boyutu kullanir; yoksa (eski cizimler,
    // veya hic duzenlenmemis yeni cizimler) kutunun merkezine, otomatik punto ile
    // yerlesir - bkz. docs/VARSAYIMLAR.md, "Ad-hoc: Cizim Etiketi Serbest Konum".
    const labelCx = el.labelX ?? el.x + el.widthMm / 2;
    const labelCy = el.labelY ?? el.y + el.heightMm / 2;
    const labelFontSize =
      el.labelFontSizeMm ??
      fitFontSize(el.label, el.labelWidthMm ?? el.widthMm, el.heightMm);
    const label = renderCenteredText(el.label, labelCx, labelCy, labelFontSize);
    parts.push(
      `<g data-id="${el.id}" data-category="${escapeXml(el.category)}">` +
        `<rect x="${el.x}" y="${el.y}" width="${el.widthMm}" height="${el.heightMm}" fill="#fff" stroke="#222" stroke-width="0.4"/>` +
        label +
        `</g>`,
    );
  }

  return parts.join('');
}

export function renderDrawingView(
  model: DrawingModel,
  viewKey: DrawingViewKey,
): string {
  const { plateWidthMm: w, plateHeightMm: h } = model;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="Arial, Helvetica, sans-serif">`,
    renderView(model, viewKey),
    `</svg>`,
  ].join('');
}

export function renderDrawingModel(
  model: DrawingModel,
): Record<DrawingViewKey, string> {
  return {
    internal: renderDrawingView(model, 'internal'),
    coverPlate: renderDrawingView(model, 'coverPlate'),
    external: renderDrawingView(model, 'external'),
  };
}
