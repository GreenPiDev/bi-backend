import { slugify } from './slugify';

describe('slugify', () => {
  it('bosluklari tire yapar ve kucuk harfe cevirir', () => {
    expect(slugify('Acme Yazilim')).toBe('acme-yazilim');
  });

  it('Turkce karakterleri ASCII karsiliklarina cevirir', () => {
    expect(slugify('Güneş Şirketi Çöl Işı')).toBe('gunes-sirketi-col-isi');
  });

  it("Turkce buyuk İ harfini (i/İ tuzagi) dogru sekilde 'i' yapar", () => {
    const result = slugify('İstanbul Ticaret');
    expect(result).toBe('istanbul-ticaret');
    expect(result).not.toMatch(/[^a-z0-9-]/);
  });

  it('bastaki/sondaki tireleri temizler', () => {
    expect(slugify('  !!Deneme!!  ')).toBe('deneme');
  });

  it('60 karakteri asmaz', () => {
    const longName = 'a'.repeat(100);
    expect(slugify(longName).length).toBeLessThanOrEqual(60);
  });
});
