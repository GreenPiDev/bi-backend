import type { Prisma } from '@prisma/client';
import type { StockStatusFilter } from './dto/stock-item.dto';

/** Satir arkaplan renklendirmesiyle (bi-frontend stock-status.ts) ayni esik - filtre
 * penceresindeki 4 secenegin karsiligi. stock-items ve products modulleri arasinda
 * paylasiliyor (her ikisi de /envanter'de ayni renk/durum kurallarini kullaniyor). */
export function getStockStatus(
  quantity: Prisma.Decimal | string | number,
  minStockLevel: number | null,
): StockStatusFilter {
  if (minStockLevel === null || minStockLevel === undefined) return 'unknown';
  const qty = Number(quantity);
  if (qty < minStockLevel) return 'low';
  if (qty === minStockLevel) return 'equal';
  return 'ok';
}

/** Varsayilan (kullanici hicbir kolona tiklamamisken) siralama - renk/durum sirasi,
 * bi-frontend stock-status.ts'teki STOCK_STATUS_SORT_ORDER ile ayni. */
export const STOCK_STATUS_SORT_ORDER: Record<StockStatusFilter, number> = {
  low: 0,
  equal: 1,
  ok: 2,
  unknown: 3,
};
