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

export const StockMovementTypeSchema = z.enum([
  'INCREASE',
  'DECREASE',
  'QUOTE_SALE',
  'TRANSFER_OUT',
  'TRANSFER_IN',
  'CORRECTION',
]);

/** Stok Gecmisi filtre penceresi: urune, depoya, guncellemeyi yapan kullaniciya ve
 * (coklu secilebilen, virgulle ayrilmis) hareket turune gore. */
export const StockHistoryQuerySchema = z.object({
  productId: z.string().optional(),
  warehouseId: z.string().optional(),
  userId: z.string().optional(),
  types: z
    .string()
    .optional()
    .transform((val) => (val ? val.split(',').filter(Boolean) : undefined))
    .pipe(z.array(StockMovementTypeSchema).optional()),
});
export type StockHistoryQueryDto = z.infer<typeof StockHistoryQuerySchema>;

/**
 * Stok girisi (alim/parti) - bkz. docs/PLAN_STOK_MALIYET.md Faz 2. unitCost zorunlu:
 * her girisin WAC (hareketli agirlikli ortalama maliyet) hesabina katkisi var.
 */
export const IncreaseStockSchema = z.object({
  warehouseId: z.string().uuid('Depo secimi gerekli.'),
  quantity: z.number().positive("Miktar 0'dan buyuk olmalidir."),
  unitCost: z.number().positive("Birim maliyet 0'dan buyuk olmalidir."),
  note: z.string().trim().max(500).optional(),
});
export type IncreaseStockDto = z.infer<typeof IncreaseStockSchema>;

/**
 * Stok cikisi (elle dusus) - maliyeti degistirmez, sadece miktari dusurur. Negatife
 * dusmeye izin verilir (bkz. docs/PLAN_STOK_MALIYET.md karar 6).
 */
export const DecreaseStockSchema = z.object({
  warehouseId: z.string().uuid('Depo secimi gerekli.'),
  quantity: z.number().positive("Miktar 0'dan buyuk olmalidir."),
  note: z.string().trim().max(500).optional(),
});
export type DecreaseStockDto = z.infer<typeof DecreaseStockSchema>;

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
