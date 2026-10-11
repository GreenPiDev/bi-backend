import { Prisma } from '@prisma/client';

const DAYS_PER_MONTH = 30;

/**
 * Aylik orandan (%), 30 gune bolunmus bilesik (compound) gunluk orani hesaplar.
 * Ornek: aylik %3,5 -> gunluk ~%0,1147 (DUZ bolme olan %3,5/30 = %0,1167 degil -
 * bilesik oldugu icin gunluk oran biraz daha dusuktur, ama 30 gun ust uste
 * uygulandiginda tam aylik orana denk gelir).
 */
export function dailyHoldingCostRate(monthlyRatePct: number): Prisma.Decimal {
  const monthlyFactor = new Prisma.Decimal(monthlyRatePct).div(100).add(1);
  return monthlyFactor.pow(new Prisma.Decimal(1).div(DAYS_PER_MONTH)).sub(1);
}

/** Bir urunun ortalama maliyetine (avgCost) bir gunluk stok bekletme maliyeti
 * artisini uygular. */
export function applyDailyHoldingCost(
  avgCost: Prisma.Decimal,
  monthlyRatePct: number,
): Prisma.Decimal {
  return avgCost.mul(dailyHoldingCostRate(monthlyRatePct).add(1));
}
