import { resolveFooterMarginMm } from './quote-pdf.service';

describe('resolveFooterMarginMm', () => {
  it('otomatik yukseklikte eski 28mm marji korur', () => {
    expect(
      resolveFooterMarginMm(
        { footerHeightMm: null, footerLogoHeightMm: 7 },
        false,
      ),
    ).toBe(28);
  });

  it('otomatik yukseklikte logo varsa ek pay birakir', () => {
    expect(
      resolveFooterMarginMm(
        { footerHeightMm: null, footerLogoHeightMm: 7 },
        true,
      ),
    ).toBe(37);
    expect(
      resolveFooterMarginMm(
        { footerHeightMm: null, footerLogoHeightMm: 20 },
        true,
      ),
    ).toBe(50);
  });

  it('sabit yukseklikte marj birebir o deger olur', () => {
    expect(
      resolveFooterMarginMm(
        { footerHeightMm: 18, footerLogoHeightMm: 7 },
        true,
      ),
    ).toBe(18);
  });
});
