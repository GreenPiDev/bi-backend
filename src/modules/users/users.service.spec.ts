import { generateTemporaryPassword } from './users.service';

describe('generateTemporaryPassword', () => {
  it('her zaman 6 haneli, sadece rakamlardan olusan bir string doner', () => {
    for (let i = 0; i < 200; i++) {
      const password = generateTemporaryPassword();
      expect(password).toMatch(/^\d{6}$/);
    }
  });

  it('sifirla baslayabiliyor (padStart dogru calisiyor)', () => {
    const passwords = Array.from({ length: 500 }, () =>
      generateTemporaryPassword(),
    );
    expect(passwords.some((p) => p.startsWith('0'))).toBe(true);
  });
});
