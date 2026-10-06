import { normalizeDeg, rotatedFootprint } from './geometry';

describe('normalizeDeg', () => {
  it('negatif acilari pozitif araliga tasir', () => {
    expect(normalizeDeg(-90)).toBe(270);
  });

  it("360 ve katlarini 0'a normalize eder", () => {
    expect(normalizeDeg(360)).toBe(0);
    expect(normalizeDeg(720)).toBe(0);
  });

  it('[0,360) icindeki aciyi degistirmeden doner', () => {
    expect(normalizeDeg(45)).toBe(45);
  });
});

describe('rotatedFootprint', () => {
  const size = { widthMm: 100, heightMm: 50 };

  it('0 derecede boyutu degistirmez', () => {
    expect(rotatedFootprint(size, 0)).toEqual(size);
  });

  it('180 derecede boyutu degistirmez', () => {
    expect(rotatedFootprint(size, 180)).toEqual(size);
  });

  it('90 derecede genislik/yukseklik yer degistirir', () => {
    expect(rotatedFootprint(size, 90)).toEqual({ widthMm: 50, heightMm: 100 });
  });

  it('270 derecede genislik/yukseklik yer degistirir', () => {
    expect(rotatedFootprint(size, 270)).toEqual({ widthMm: 50, heightMm: 100 });
  });

  it('45 derecede eksen-hizali sinirlayici kutuyu (bounding box) doner', () => {
    const square = { widthMm: 10, heightMm: 10 };
    const result = rotatedFootprint(square, 45);
    // 10x10 bir karenin 45 derece donmus bounding box'i ~14.14 (10*sqrt(2))
    expect(result.widthMm).toBeCloseTo(14.14, 1);
    expect(result.heightMm).toBeCloseTo(14.14, 1);
  });
});
