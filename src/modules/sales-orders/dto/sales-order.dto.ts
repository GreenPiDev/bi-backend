import { z } from 'zod';
import { ListQuerySchema } from '../../../core/dto/list-query.dto';

export const SalesOrderStatusSchema = z.enum([
  'PENDING',
  'PROCESSING',
  'READY_FOR_SHIPMENT',
  'SHIPPED',
  'DELIVERED',
  'COMPLETED',
  'CANCELLED',
]);

/** SalesOrder sadece Quote onayinda otomatik olusur (bkz. QuotesService.
 * ensureSalesOrder) - kullaniciya acik tek yazma islemi durum degisikligidir. */
export const UpdateSalesOrderSchema = z.object({
  status: SalesOrderStatusSchema,
});
export type UpdateSalesOrderDto = z.infer<typeof UpdateSalesOrderSchema>;

export const SalesOrderQuerySchema = ListQuerySchema.extend({
  accountId: z.string().uuid().optional(),
  status: SalesOrderStatusSchema.optional(),
});
export type SalesOrderQueryDto = z.infer<typeof SalesOrderQuerySchema>;
