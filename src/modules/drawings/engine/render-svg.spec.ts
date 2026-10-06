import { renderDrawingModel, renderDrawingView } from './render-svg';
import type { DrawingModel } from './types';

function createModel(overrides: Partial<DrawingModel> = {}): DrawingModel {
  return {
    plateWidthMm: 1000,
    plateHeightMm: 2000,
    views: {
      internal: {
        elements: [
          {
            id: 'e1',
            libraryComponentKey: 'switch-compact',
            label: '3X2500A',
            category: 'SWITCH',
            bandKey: 'main-breaker',
            x: 100,
            y: 300,
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
        id: 'b1',
        startX: 50,
        startY: 50,
        endX: 950,
        endY: 50,
        thicknessMm: 10,
        phaseCount: 3,
      },
    ],
    ...overrides,
  };
}

describe('renderDrawingView', () => {
  it('gecerli bir SVG dokumani uretir (viewBox plaka olculeriyle eslesir)', () => {
    const svg = renderDrawingView(createModel(), 'internal');
    expect(svg).toContain('<svg');
    expect(svg).toContain('viewBox="0 0 1000 2000"');
    expect(svg).toContain('</svg>');
  });

  it("internal goruntude elemanlari ve bara'yi cizer", () => {
    const svg = renderDrawingView(createModel(), 'internal');
    expect(svg).toContain('data-id="e1"');
    expect(svg).toContain('>3X2500A<');
    expect(svg).toContain('data-id="b1"');
    expect(svg).toContain('<line');
  });

  it('coverPlate goruntude bara CIZILMEZ, sadece o gorunumun elemanlari cizilir', () => {
    const model = createModel({
      views: {
        internal: { elements: [] },
        coverPlate: {
          elements: [
            {
              id: 'e2',
              libraryComponentKey: 'switch-compact',
              label: '3X1000A',
              category: 'SWITCH',
              bandKey: 'outgoing',
              x: 10,
              y: 10,
              widthMm: 100,
              heightMm: 100,
              rotationDeg: 0,
            },
          ],
        },
        external: { elements: [] },
      },
    });
    const svg = renderDrawingView(model, 'coverPlate');
    expect(svg).not.toContain('<line');
    expect(svg).toContain('data-id="e2"');
  });

  it('external goruntude (bos elemanlar) sadece plaka diktortgeni olur', () => {
    const svg = renderDrawingView(createModel(), 'external');
    expect(svg).not.toContain('<g ');
    expect(svg).not.toContain('<line');
    expect(svg).toContain('<rect');
  });

  it('XSS/ozel karakter iceren etiketi escape eder', () => {
    const model = createModel({
      views: {
        internal: {
          elements: [
            {
              id: 'e3',
              libraryComponentKey: 'k',
              label: '<script>alert("x")</script>',
              category: 'SWITCH',
              bandKey: 'main-breaker',
              x: 0,
              y: 0,
              widthMm: 50,
              heightMm: 50,
              rotationDeg: 0,
            },
          ],
        },
        coverPlate: { elements: [] },
        external: { elements: [] },
      },
      busbars: [],
    });
    const svg = renderDrawingView(model, 'internal');
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
  });
});

describe('renderDrawingModel', () => {
  it('uc gorusun tamamini birden doner', () => {
    const result = renderDrawingModel(createModel());
    expect(Object.keys(result).sort()).toEqual([
      'coverPlate',
      'external',
      'internal',
    ]);
    expect(result.internal).toContain('<svg');
    expect(result.coverPlate).toContain('<svg');
    expect(result.external).toContain('<svg');
  });
});
