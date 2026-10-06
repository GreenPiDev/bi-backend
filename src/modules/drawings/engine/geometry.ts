/**
 * Saf geometri yardimcilari - DOM/Fabric bagimsiz, tamamen unit test edilebilir.
 * proje-1'in `web/src/model/geometry.ts`'inden portlandi (bkz. docs/VARSAYIMLAR.md V52,
 * bi-backend-drawing-module-prompt.md) - DXF donusum kismi bu MVP'de yok (D8+).
 */

export interface Size {
  widthMm: number;
  heightMm: number;
}

const FULL_TURN_DEG = 360;

/** Herhangi bir aciyi [0, 360) araligina normalize eder. */
export function normalizeDeg(deg: number): number {
  return ((deg % FULL_TURN_DEG) + FULL_TURN_DEG) % FULL_TURN_DEG;
}

/**
 * Dondurulmus parcanin yerlesim (spacing) icin kullanilacak footprint'i. 90/270
 * derecede W/H tam yer degistirir; diger acilarda donmus dikdortgenin eksen-hizali
 * sinirlayici kutusu (bounding box) donulur - yerlesim hesaplarinin asla eksik
 * sayilmamasi icin proje-1'deki `rotatedFootprint` ile ayni yaklasim.
 */
export function rotatedFootprint(size: Size, rotationDeg: number): Size {
  const angle = normalizeDeg(rotationDeg);
  if (angle === 0 || angle === 180) {
    return size;
  }
  if (angle === 90 || angle === 270) {
    return { widthMm: size.heightMm, heightMm: size.widthMm };
  }
  const rad = (angle * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  return {
    widthMm: size.widthMm * cos + size.heightMm * sin,
    heightMm: size.widthMm * sin + size.heightMm * cos,
  };
}
