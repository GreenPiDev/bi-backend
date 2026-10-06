import { renderDrawingModelToDxf } from './dxf';
import type { DrawingModel } from './types';

function createModel(): DrawingModel {
  return {
    plateWidthMm: 1000,
    plateHeightMm: 2000,
    views: {
      internal: {
        elements: [
          {
            id: 'el1',
            libraryComponentKey: 'switch-compact',
            label: 'Kompakt Şalter',
            category: 'SWITCH',
            bandKey: 'main-breaker',
            x: 10,
            y: 20,
            widthMm: 150,
            heightMm: 200,
            rotationDeg: 0,
          },
        ],
      },
      coverPlate: { elements: [] },
      external: { elements: [] },
    },
    busbars: [
      {
        id: 'bar1',
        startX: 0,
        startY: 0,
        endX: 1000,
        endY: 0,
        thicknessMm: 20,
        phaseCount: 3,
      },
    ],
  };
}

describe('renderDrawingModelToDxf', () => {
  it('gecerli bir DXF govdesi uretir: HEADER/TABLES/ENTITIES bolumleri ve EOF ile biter', () => {
    const dxf = renderDrawingModelToDxf(createModel());

    expect(dxf.startsWith('0\nSECTION\n2\nHEADER')).toBe(true);
    expect(dxf).toContain('2\nTABLES');
    expect(dxf).toContain('2\nENTITIES');
    expect(dxf.trimEnd().endsWith('0\nEOF')).toBe(true);
  });

  it('her gorunum icin ayri bir katman (layer) adi kullanir', () => {
    const dxf = renderDrawingModelToDxf(createModel());

    expect(dxf).toContain('IC_GORUNUS');
    expect(dxf).toContain('ORTU_PLAKALI_GORUNUS');
    expect(dxf).toContain('DIS_GORUNUS');
  });

  it('elemanin etiketini TEXT entity olarak ve kategori katmaninda yazar', () => {
    const dxf = renderDrawingModelToDxf(createModel());

    expect(dxf).toContain('0\nTEXT');
    expect(dxf).toContain('Kompakt Şalter');
  });

  it('barayi sadece ic gorunus katmaninda (BARA) kapali bir dortgen olarak cizer', () => {
    const dxf = renderDrawingModelToDxf(createModel());

    expect(dxf).toContain('BARA');
    // thicknessMm=20 -> yarisi 10mm yukari/asagi kaydirilmis koseler.
    expect(dxf).toContain('20\n10.000');
  });

  it('kalinligi sifir olmayan sadece gecerli baralari cizer, uzunlugu 0 olan barayi atlar', () => {
    const model = createModel();
    model.busbars = [
      {
        id: 'zero',
        startX: 5,
        startY: 5,
        endX: 5,
        endY: 5,
        thicknessMm: 10,
        phaseCount: 1,
      },
    ];
    const dxf = renderDrawingModelToDxf(model);

    // Sadece plaka/eleman LWPOLYLINE'lari kalmali, BARA katmaninda entity olmamali.
    const busbarSectionIndex = dxf.indexOf('8\nBARA');
    expect(busbarSectionIndex).toBe(-1);
  });
});
