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

/** Stok Gecmisi filtre penceresi: urune, depoya ve guncellemeyi yapan kullaniciya gore. */
export const StockHistoryQuerySchema = z.object({
  productId: z.string().optional(),
  warehouseId: z.string().optional(),
  userId: z.string().optional(),
});
export type StockHistoryQueryDto = z.infer<typeof StockHistoryQuerySchema>;

export const UpsertStockItemSchema = z.object({
  warehouseId: z.string().uuid('Depo secimi gerekli.'),
  quantity: z.number().nonnegative(),
  note: z.string().trim().max(500).optional(),
});
export type UpsertStockItemDto = z.infer<typeof UpsertStockItemSchema>;

/** Depolar arasi stok tasima (ad-hoc, bkz. CLAUDE.md). */
export const TransferStockSchema = z
  .object({
    fromWarehouseId: z.string().uuid('Kaynak depo secimi gerekli.'),
    toWarehouseId: z.string().uuid('Hedef depo secimi gerekli.'),
    quantity: z.number().positive("Miktar 0'dan buyuk olmalidir."),
    note: z.string().trim().max(500).optional(),
  })
  .refine((dto) => dto.fromWarehouseId !== dto.toWarehouseId, {
    message: 'Kaynak ve hedef depo farkli olmalidir.',
    path: ['toWarehouseId'],
  });
export type TransferStockDto = z.infer<typeof TransferStockSchema>;
