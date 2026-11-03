import { isIssuedBeforePasswordChange } from './password-reset.constants';

describe('isIssuedBeforePasswordChange', () => {
  const changedAt = Date.parse('2026-11-03T10:00:30.500Z');
  const changedSec = Math.floor(changedAt / 1000);

  it('sifre degisiminden onceki token gecersizdir', () => {
    expect(isIssuedBeforePasswordChange(changedSec - 1, changedAt)).toBe(true);
  });

  it('ayni saniyede veya sonra cikarilan token gecerlidir', () => {
    expect(isIssuedBeforePasswordChange(changedSec, changedAt)).toBe(false);
    expect(isIssuedBeforePasswordChange(changedSec + 5, changedAt)).toBe(false);
  });

  it('iat yoksa reddetmez', () => {
    expect(isIssuedBeforePasswordChange(undefined, changedAt)).toBe(false);
  });
});
