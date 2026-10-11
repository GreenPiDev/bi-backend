import { Prisma } from '@prisma/client';
import {
  applyDailyHoldingCost,
  dailyHoldingCostRate,
} from './stock-holding-cost.util';

describe('stock-holding-cost.util', () => {
  it('gunluk oran, duz bolmeden (aylik/30) kucuktur (bilesik oldugu icin)', () => {
    const daily = dailyHoldingCostRate(3.5);
    expect(daily.toNumber()).toBeLessThan(3.5 / 100 / 30);
    expect(daily.toNumber()).toBeGreaterThan(0);
  });

  it('30 gun ust uste uygulandiginda tam aylik orana ulasir', () => {
    let cost = new Prisma.Decimal(1);
    for (let i = 0; i < 30; i++) {
      cost = applyDailyHoldingCost(cost, 3.5);
    }
    expect(cost.toNumber()).toBeCloseTo(1.035, 6);
  });

  it('oran 0 ise maliyet degismez', () => {
    const cost = applyDailyHoldingCost(new Prisma.Decimal('100'), 0);
    expect(cost.toNumber()).toBe(100);
  });

  it('ikinci gunun artisi, aylik oranin tam 1/30u degil, bilesik degerdir', () => {
    const day1 = applyDailyHoldingCost(new Prisma.Decimal(1), 3.5);
    const day2 = applyDailyHoldingCost(day1, 3.5);
    expect(day2.toNumber()).toBeCloseTo(1.0022957, 6);
  });
});
