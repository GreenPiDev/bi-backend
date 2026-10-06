import type {
  DrawingBusbarInstance,
  DrawingElementInstance,
  DrawingModel,
  DrawingViewKey,
} from './types';

/**
 * DrawingModel -> DXF (ASCII, AC1021/AutoCAD 2007 uyumlu) donusturucu - Faz D8
 * (bkz. docs/VARSAYIMLAR.md V56). render-svg.ts'teki "tek dogruluk kaynagi" ilkesiyle
 * ayni: DXF de HER ZAMAN bu modelden uretilir. Bu dosya SAF bir string-uretici (ne
 * Playwright ne tarayici kullanir) - drawing-pdf.service.ts'in aksine tam unit test
 * edilebilir, bu yuzden bir Nest servisi degil duz fonksiyon olarak tutuldu (render-svg.ts
 * ile ayni desen).
 */

const VIEW_LAYER_NAMES: Record<DrawingViewKey, string> = {
  internal: 'IC_GORUNUS',
  coverPlate: 'ORTU_PLAKALI_GORUNUS',
  external: 'DIS_GORUNUS',
};

const BUSBAR_LAYER = 'BARA';

function pair(code: number, value: string | number): string {
  return `${code}\n${value}`;
}

function closedPolyline(
  layer: string,
  corners: Array<[number, number]>,
): string[] {
  const lines = [
    pair(0, 'LWPOLYLINE'),
    pair(8, layer),
    pair(90, corners.length),
    pair(70, 1),
  ];
  for (const [x, y] of corners) {
    lines.push(pair(10, x.toFixed(3)), pair(20, y.toFixed(3)));
  }
  return lines;
}

function rectangleCorners(
  x: number,
  y: number,
  widthMm: number,
  heightMm: number,
): Array<[number, number]> {
  return [
    [x, y],
    [x + widthMm, y],
    [x + widthMm, y + heightMm],
    [x, y + heightMm],
  ];
}

function textEntity(
  layer: string,
  x: number,
  y: number,
  heightMm: number,
  text: string,
): string[] {
  return [
    pair(0, 'TEXT'),
    pair(8, layer),
    pair(10, x.toFixed(3)),
    pair(20, y.toFixed(3)),
    pair(40, heightMm.toFixed(3)),
    pair(1, text.replace(/[\r\n]+/g, ' ')),
  ];
}

/** render-svg.ts'teki fitFontSize'in sadeleştirilmiş eşdeğeri - DXF'te metin kutuya
 * sığdırma amaçlı değil, sadece okunabilir bir punto seçmek için. */
function labelFontHeight(heightMm: number): number {
  return Math.max(2.5, Math.min(0.4 * heightMm, 10));
}

function elementEntities(layer: string, el: DrawingElementInstance): string[] {
  const fontHeight = labelFontHeight(el.heightMm);
  return [
    ...closedPolyline(
      layer,
      rectangleCorners(el.x, el.y, el.widthMm, el.heightMm),
    ),
    ...textEntity(
      layer,
      el.x + el.widthMm / 2 - el.label.length * fontHeight * 0.3,
      el.y + el.heightMm / 2 - fontHeight / 2,
      fontHeight,
      el.label,
    ),
  ];
}

/** Bara, SVG'deki kalın çizgiyle aynı görünümü vermek için kapalı bir dörtgen
 * (çizginin kalınlık kadar genişletilmiş hali) olarak çizilir. */
function busbarPolyline(layer: string, bar: DrawingBusbarInstance): string[] {
  const dx = bar.endX - bar.startX;
  const dy = bar.endY - bar.startY;
  const length = Math.hypot(dx, dy);
  if (length === 0) {
    return [];
  }
  const half = bar.thicknessMm / 2;
  const nx = (-dy / length) * half;
  const ny = (dx / length) * half;
  const corners: Array<[number, number]> = [
    [bar.startX + nx, bar.startY + ny],
    [bar.endX + nx, bar.endY + ny],
    [bar.endX - nx, bar.endY - ny],
    [bar.startX - nx, bar.startY - ny],
  ];
  return closedPolyline(layer, corners);
}

function layerTableEntry(name: string): string[] {
  return [
    pair(0, 'LAYER'),
    pair(2, name),
    pair(70, 0),
    pair(62, 7),
    pair(6, 'CONTINUOUS'),
  ];
}

export function renderDrawingModelToDxf(model: DrawingModel): string {
  const layerNames = [...Object.values(VIEW_LAYER_NAMES), BUSBAR_LAYER];

  const header = [
    pair(0, 'SECTION'),
    pair(2, 'HEADER'),
    pair(9, '$ACADVER'),
    pair(1, 'AC1021'),
    pair(9, '$INSUNITS'),
    pair(70, 4),
    pair(0, 'ENDSEC'),
  ];

  const tables = [
    pair(0, 'SECTION'),
    pair(2, 'TABLES'),
    pair(0, 'TABLE'),
    pair(2, 'LAYER'),
    pair(70, layerNames.length),
    ...layerNames.flatMap(layerTableEntry),
    pair(0, 'ENDTAB'),
    pair(0, 'ENDSEC'),
  ];

  const entities: string[] = [];
  // Bara sadece ic gorunuste cizilir (render-svg.ts ile ayni karar).
  for (const bar of model.busbars) {
    entities.push(...busbarPolyline(BUSBAR_LAYER, bar));
  }
  for (const viewKey of Object.keys(VIEW_LAYER_NAMES) as DrawingViewKey[]) {
    const layer = VIEW_LAYER_NAMES[viewKey];
    entities.push(
      ...closedPolyline(
        layer,
        rectangleCorners(0, 0, model.plateWidthMm, model.plateHeightMm),
      ),
    );
    for (const el of model.views[viewKey].elements) {
      entities.push(...elementEntities(layer, el));
    }
  }

  const entitiesSection = [
    pair(0, 'SECTION'),
    pair(2, 'ENTITIES'),
    ...entities,
    pair(0, 'ENDSEC'),
  ];

  return [...header, ...tables, ...entitiesSection, pair(0, 'EOF')].join('\n');
}
