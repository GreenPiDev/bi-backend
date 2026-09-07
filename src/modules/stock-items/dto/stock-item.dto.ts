import { z } from 'zod';
import { ListQuerySchema } from '../../../core/dto/list-query.dto';

export const StockItemQuerySchema = ListQuerySchema.extend({});
export type StockItemQueryDto = z.infer<typeof StockItemQuerySchema>;

export const UpsertStockItemSchema = z.object({
  quantity: z.number().nonnegative(),
});
export type UpsertStockItemDto = z.infer<typeof UpsertStockItemSchema>;
