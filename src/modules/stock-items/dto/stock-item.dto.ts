import { z } from 'zod';
import { ListQuerySchema } from '../../../core/dto/list-query.dto';

export const StockStatusFilterSchema = z.enum([
  'low',
  'equal',
  'ok',
  'unknown',
]);
export type StockStatusFilter = z.infer<typeof StockStatusFilterSchema>;

export const StockItemQuerySchema = ListQuerySchema.extend({
  /** /envanter?tab=products'taki filtre paneliyle ayni desen (bkz. ProductQuerySchema). */
  productListId: z.string().uuid().optional(),
  brand: z.string().trim().min(1).optional(),
  category: z.string().trim().min(1).optional(),
  /** Satir arkaplan renklendirmesiyle ayni esik (bkz. bi-frontend stock-status.ts):
   * low = minStockLevel'in altinda, equal = esit, ok = ustunde, unknown = minStockLevel tanimsiz. */
  stockStatus: StockStatusFilterSchema.optional(),
});
export type StockItemQueryDto = z.infer<typeof StockItemQuerySchema>;

/** Stok Gecmisi filtre penceresi: urune ve guncellemeyi yapan kullaniciya gore. */
export const StockHistoryQuerySchema = z.object({
  productId: z.string().optional(),
  userId: z.string().optional(),
});
export type StockHistoryQueryDto = z.infer<typeof StockHistoryQuerySchema>;

export const UpsertStockItemSchema = z.object({
  quantity: z.number().nonnegative(),
  note: z.string().trim().max(500).optional(),
});
export type UpsertStockItemDto = z.infer<typeof UpsertStockItemSchema>;
