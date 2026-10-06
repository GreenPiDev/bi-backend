import { rotatedFootprint, type Size } from './geometry';
import type { DrawingElementInstance } from './types';

export interface PackableDevice {
  id: string;
  libraryComponentKey: string;
  label: string;
  category: string;
  widthMm: number;
  heightMm: number;
  rotationDeg?: number;
}

export interface TemplateBand {
  key: string;
  y: number;
  heightMm: number;
}

/**
 * Bir bandin icindeki elemanlari soldan saga, aralarinda `clearanceMm` bosluk
 * birakarak dizer; her eleman bant yuksekligine dikey olarak ortalanir. proje-1'in
 * `web/src/model/rows.ts#packRow` fonksiyonunun sadelestirilmis portu - duct/
 * rail-offset kavramlari yok (bu motorda bant sabit bir dikdortgen bolge, kanal
 * nesnesi degil). Deterministik ve saf (yan etkisiz) - "AI asla geometri uretmez"
 * ilkesiyle uyumlu (bkz. bi-backend-drawing-module-prompt.md).
 */
export function autoPackBand(
  band: TemplateBand,
  devices: readonly PackableDevice[],
  clearanceMm: number,
): DrawingElementInstance[] {
  const bandCenterY = band.y + band.heightMm / 2;
  let cursorX = clearanceMm;
  const placed: DrawingElementInstance[] = [];
  for (const device of devices) {
    const rotationDeg = device.rotationDeg ?? 0;
    const footprint: Size = rotatedFootprint(
      { widthMm: device.widthMm, heightMm: device.heightMm },
      rotationDeg,
    );
    const y = bandCenterY - footprint.heightMm / 2;
    placed.push({
      id: device.id,
      libraryComponentKey: device.libraryComponentKey,
      label: device.label,
      category: device.category,
      bandKey: band.key,
      x: +cursorX.toFixed(2),
      y: +y.toFixed(2),
      widthMm: +footprint.widthMm.toFixed(2),
      heightMm: +footprint.heightMm.toFixed(2),
      rotationDeg,
    });
    cursorX += footprint.widthMm + clearanceMm;
  }
  return placed;
}
