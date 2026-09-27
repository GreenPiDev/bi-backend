import { describe, expect, it } from 'vitest';
import { isPastCalendarDay, parseFlexibleDate } from './date';

describe('parseFlexibleDate', () => {
  it('TR gg.AA.yyyy formatini UTC gece yarisi olarak ayristirir', () => {
    const d = parseFlexibleDate('08.07.2026');
    expect(d?.toISOString()).toBe('2026-07-08T00:00:00.000Z');
  });

  it('TR gg.AA.yyyy ss:dd:ss formatini saatiyle birlikte ayristirir', () => {
    const d = parseFlexibleDate('08.07.2026 13:45:30');
    expect(d?.toISOString()).toBe('2026-07-08T13:45:30.000Z');
  });

  it('ISO tarih-saat formatini ayristirir (gercek Excel tarih hucresi)', () => {
    const d = parseFlexibleDate('2026-07-07T10:44:33.000Z');
    expect(d?.toISOString()).toBe('2026-07-07T10:44:33.000Z');
  });

  it('sadece ISO tarih formatini da ayristirir', () => {
    const d = parseFlexibleDate('2026-07-07');
    expect(d?.getUTCFullYear()).toBe(2026);
  });

  it('gecersiz gun/ay degerlerinde null doner', () => {
    expect(parseFlexibleDate('45.13.2026')).toBeNull();
  });

  it('takvimde olmayan bir gunde (31.02) null doner', () => {
    expect(parseFlexibleDate('31.02.2026')).toBeNull();
  });

  it('taninmayan bir formatta null doner', () => {
    expect(parseFlexibleDate('bugun')).toBeNull();
    expect(parseFlexibleDate('07/08/2026')).toBeNull();
  });
});

describe('isPastCalendarDay', () => {
  const now = new Date(2026, 8, 25, 14, 30, 0);

  it('dunku tarihi gecmis sayar', () => {
    expect(isPastCalendarDay(new Date(2026, 8, 24, 23, 59, 0), now)).toBe(true);
  });

  it('bugunku tarihi, saat gunun ilerisinde olsa bile gecmis saymaz', () => {
    expect(isPastCalendarDay(new Date(2026, 8, 25, 0, 0, 0), now)).toBe(false);
  });

  it('bugunku tarihi, saat gecmiste olsa bile gecmis saymaz', () => {
    expect(isPastCalendarDay(new Date(2026, 8, 25, 9, 0, 0), now)).toBe(false);
  });

  it('yarinki tarihi gecmis saymaz', () => {
    expect(isPastCalendarDay(new Date(2026, 8, 26, 0, 0, 0), now)).toBe(false);
  });
});
