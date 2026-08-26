import { isValidTaxNumber } from './tax';

describe('isValidTaxNumber', () => {
  it('gecerli TCKN (11 hane) kabul eder', () => {
    expect(isValidTaxNumber('10000000146')).toBe(true);
  });

  it('gecerli VKN (10 hane) kabul eder', () => {
    expect(isValidTaxNumber('1234567890')).toBe(true);
  });

  it('gecersiz kontrol basamakli TCKN reddeder', () => {
    expect(isValidTaxNumber('10000000147')).toBe(false);
  });

  it('gecersiz kontrol basamakli VKN reddeder', () => {
    expect(isValidTaxNumber('1234567891')).toBe(false);
  });

  it("0 ile baslayan TCKN'yi reddeder", () => {
    expect(isValidTaxNumber('01234567890')).toBe(false);
  });

  it('yanlis uzunlugu reddeder', () => {
    expect(isValidTaxNumber('12345')).toBe(false);
  });

  it('rakam olmayan karakter icerenleri reddeder', () => {
    expect(isValidTaxNumber('123456789a')).toBe(false);
  });
});
