import { buildCsv } from './csv';

describe('buildCsv', () => {
  it('basliklari kolon label larindan olusturur', () => {
    const csv = buildCsv(
      [
        { name: 'sehir', type: 'STRING', label: 'Şehir' },
        { name: 'toplam', type: 'NUMBER', label: 'Toplam' },
      ],
      [['İstanbul', 100]],
    );
    expect(csv).toBe('Şehir,Toplam\r\nİstanbul,100');
  });

  it('formul enjeksiyonu icin =,+,-,@ ile baslayan hucreleri kacislar', () => {
    const csv = buildCsv(
      [{ name: 'not', type: 'STRING', label: 'Not' }],
      [['=cmd|calc'], ['+1'], ['-1'], ['@SUM(A1)'], ['normal']],
    );
    const lines = csv.split('\r\n');
    expect(lines).toEqual([
      'Not',
      "'=cmd|calc",
      "'+1",
      "'-1",
      "'@SUM(A1)",
      'normal',
    ]);
  });

  it('sayisal ve null degerleri oldugu gibi birakir', () => {
    const csv = buildCsv(
      [{ name: 'tutar', type: 'NUMBER', label: 'Tutar' }],
      [[100], [null]],
    );
    expect(csv).toBe('Tutar\r\n100\r\n');
  });
});
