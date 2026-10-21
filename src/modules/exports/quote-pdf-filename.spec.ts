import { buildQuotePdfFilename } from './quote-pdf-filename';

describe('buildQuotePdfFilename', () => {
  it('turkce karakterleri buyuk ASCII karsiliklarina cevirir, nokta korunur', () => {
    expect(
      buildQuotePdfFilename(
        'TEK-2026-10-21-002',
        '3AB ENERJİ VE SANAYİ TESİSLERİ TİCARET A.Ş.',
      ),
    ).toBe('TEK-2026-10-21-002-3AB-ENERJI-VE-SANAYI-TESISLERI-TICARET-A.S');
  });

  it('bosluklari tireye cevirir', () => {
    expect(buildQuotePdfFilename('TEK-1', 'Acme Yazilim Ltd')).toBe(
      'TEK-1-ACME-YAZILIM-LTD',
    );
  });

  it('dosya adinda gecersiz karakterleri tireye cevirir', () => {
    expect(buildQuotePdfFilename('TEK-1', 'A/B & C')).toBe('TEK-1-A-B-C');
  });

  it('bastaki/sondaki tire ve noktalari temizler', () => {
    expect(buildQuotePdfFilename('TEK-1', '  !!Deneme!!.  ')).toBe(
      'TEK-1-DENEME',
    );
  });
});
