/**
 * Drawing.model JSON alaninin tip tanimlari (bkz. docs/VARSAYIMLAR.md V52, Faz D4).
 * Bu motor domain-ozel cizim verisiyle calisir - EAV/analitik veri degildir, sadece
 * render/auto-pack motoru tarafindan okunur/yazilir (CLAUDE.md §16 kisidi bu alana
 * uygulanmaz).
 */

export type DrawingViewKey = 'internal' | 'coverPlate' | 'external';

export const DRAWING_VIEW_KEYS: readonly DrawingViewKey[] = [
  'internal',
  'coverPlate',
  'external',
];

/** Panoya yerlestirilmis tek bir komponent orneginin geometrisi. */
export interface DrawingElementInstance {
  id: string;
  libraryComponentKey: string;
  label: string;
  category: string;
  bandKey: string;
  x: number;
  y: number;
  widthMm: number;
  heightMm: number;
  rotationDeg: number;
}

/** Bara (busbar) segmenti - karar 3 (bkz. V52): proje-1'de karsiligi olmayan,
 * bu modul icin baştan eklenen yeni bir geometrik eleman tipi. */
export interface DrawingBusbarInstance {
  id: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  thicknessMm: number;
  phaseCount: number;
}

export interface DrawingViewModel {
  elements: DrawingElementInstance[];
}

/**
 * Tek bir cizimin tum verisi - uc gorus birden (karar 2) + bara (karar 3). `busbars`
 * sadece 'internal' goruntusunde cizilir (render-svg.ts) - kapak plakasi/dis gorunus
 * barayi gostermez, gercek AG pano referans gorselleriyle tutarli.
 */
export interface DrawingModel {
  plateWidthMm: number;
  plateHeightMm: number;
  views: Record<DrawingViewKey, DrawingViewModel>;
  busbars: DrawingBusbarInstance[];
}
