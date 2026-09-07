import { z } from 'zod';
import { ListQuerySchema } from '../../../core/dto/list-query.dto';

export const PurchaseOrderStatusSchema = z.enum(['DRAFT', 'CONFIRMED']);
export const PurchaseOrderItemSourceSchema = z.enum(['QUOTE', 'EXTRA']);

const PurchaseOrderItemInputSchema = z
  .object({
    id: z.string().uuid().optional(),
    productId: z.string().uuid().optional(),
    description: z.string().trim().min(1, 'Kalem aciklamasi bos birakilamaz.'),
    quantity: z.number().nonnegative(),
    source: PurchaseOrderItemSourceSchema,
  })
  .refine((item) => item.source !== 'QUOTE' || !!item.productId, {
    message: 'Teklif kaynakli kalemlerde urun secimi zorunludur.',
    path: ['productId'],
  });
export type PurchaseOrderItemInputDto = z.infer<
  typeof PurchaseOrderItemInputSchema
>;

export const UpdatePurchaseOrderSchema = z.object({
  status: PurchaseOrderStatusSchema.optional(),
  items: z.array(PurchaseOrderItemInputSchema).min(1).max(200).optional(),
});
export type UpdatePurchaseOrderDto = z.infer<typeof UpdatePurchaseOrderSchema>;

export const PurchaseOrderQuerySchema = ListQuerySchema.extend({
  quoteId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
});
export type PurchaseOrderQueryDto = z.infer<typeof PurchaseOrderQuerySchema>;
