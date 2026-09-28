import { z } from 'zod';
import { ListQuerySchema } from '../../../core/dto/list-query.dto';

export const PurchaseOrderStatusSchema = z.enum(['DRAFT', 'CONFIRMED']);
export const PurchaseOrderItemSourceSchema = z.enum(['QUOTE', 'EXTRA']);

const PurchaseOrderItemInputSchema = z
  .object({
    id: z.string().uuid().optional(),
    productId: z.string().uuid().optional(),
    description: z.string().trim().max(300).default(''),
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
  quoteId: z.string().uuid().nullable().optional(),
  items: z.array(PurchaseOrderItemInputSchema).min(1).max(200).optional(),
});
export type UpdatePurchaseOrderDto = z.infer<typeof UpdatePurchaseOrderSchema>;

/** /siparisler/yeni - dogrudan POST /purchase-orders, teklif zorunlu degil (bkz.
 * PurchaseOrdersService.create). Manuel olusturulan kalemler her zaman EXTRA'dir. */
const CreatePurchaseOrderItemSchema = z.object({
  productId: z.string().uuid().optional(),
  description: z.string().trim().max(300).default(''),
  quantity: z.number().positive(),
});
export const CreatePurchaseOrderSchema = z.object({
  quoteId: z.string().uuid().optional(),
  items: z.array(CreatePurchaseOrderItemSchema).min(1).max(200),
});
export type CreatePurchaseOrderDto = z.infer<typeof CreatePurchaseOrderSchema>;

export const PurchaseOrderQuerySchema = ListQuerySchema.extend({
  quoteId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  status: PurchaseOrderStatusSchema.optional(),
});
export type PurchaseOrderQueryDto = z.infer<typeof PurchaseOrderQuerySchema>;
