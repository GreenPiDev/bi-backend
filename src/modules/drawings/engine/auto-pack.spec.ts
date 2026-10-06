import { autoPackBand, type PackableDevice } from './auto-pack';

const BAND = { key: 'outgoing', y: 800, heightMm: 700 };

function device(overrides: Partial<PackableDevice> = {}): PackableDevice {
  return {
    id: 'd1',
    libraryComponentKey: 'switch-compact',
    label: '3X1000A',
    category: 'SWITCH',
    widthMm: 150,
    heightMm: 200,
    ...overrides,
  };
}

describe('autoPackBand', () => {
  it('bos cihaz listesi icin bos dizi doner', () => {
    expect(autoPackBand(BAND, [], 20)).toEqual([]);
  });

  it('tek cihazi clearanceMm kadar sol bosluktan baslatir', () => {
    const [placed] = autoPackBand(BAND, [device()], 20);
    expect(placed.x).toBe(20);
  });

  it('cihazi bant yuksekligine dikey olarak ortalar', () => {
    const [placed] = autoPackBand(BAND, [device({ heightMm: 200 })], 20);
    // bandCenterY = 800 + 700/2 = 1150; y = 1150 - 200/2 = 1050
    expect(placed.y).toBe(1050);
  });

  it('birden fazla cihazi soldan saga, aralarinda clearance birakarak dizer', () => {
    const devices = [
      device({ id: 'd1', widthMm: 150 }),
      device({ id: 'd2', widthMm: 150 }),
      device({ id: 'd3', widthMm: 100 }),
    ];
    const placed = autoPackBand(BAND, devices, 20);
    expect(placed.map((p) => p.id)).toEqual(['d1', 'd2', 'd3']);
    expect(placed[0]!.x).toBe(20); // 20
    expect(placed[1]!.x).toBe(20 + 150 + 20); // 190
    expect(placed[2]!.x).toBe(20 + 150 + 20 + 150 + 20); // 360
  });

  it('90 derece dondurulmus cihazin genislik/yuksekligini yer degistirir', () => {
    const [placed] = autoPackBand(
      BAND,
      [device({ widthMm: 100, heightMm: 50, rotationDeg: 90 })],
      10,
    );
    expect(placed.widthMm).toBe(50);
    expect(placed.heightMm).toBe(100);
  });

  it("bandKey'i yerlesen her elemana yazar", () => {
    const [placed] = autoPackBand(BAND, [device()], 20);
    expect(placed.bandKey).toBe('outgoing');
  });
});
