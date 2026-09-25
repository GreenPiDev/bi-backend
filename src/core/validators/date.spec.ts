import { describe, expect, it } from 'vitest';
import { isPastCalendarDay } from './date';

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
