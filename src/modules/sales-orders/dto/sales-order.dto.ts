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

export const UpdateSalesOrderSchema = z.object({
  status: SalesOrderStatusSchema,
});
export type UpdateSalesOrderDto = z.infer<typeof UpdateSalesOrderSchema>;

/** Teklifsiz (manuel) siparis kalemi - bkz. SalesOrderItem model doc comment'i.
 * currency client'tan alinmaz, Product.currency'den kopyalanir (QuoteItem ile ayni
 * gerekce). */
const CreateSalesOrderItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
});
export type CreateSalesOrderItemDto = z.infer<
  typeof CreateSalesOrderItemSchema
>;

/**
 * Iki ayri yol - bkz. SalesOrdersService.create() doc comment'i:
 * 1) quoteId verilirse: bu otomasyondan ONCE onaylanmis eski bir teklifin elle
 *    tamamlanmasi (backfill) - hesap/kisi/kalemler Quote'tan kopyalanir.
 * 2) accountId + items verilirse: teklifsiz, dogrudan /satis-siparisleri/yeni'de
 *    girilen manuel bir siparis - kalemler kendi SalesOrderItem'inda saklanir.
 */
export const CreateSalesOrderSchema = z
  .object({
    quoteId: z.string().uuid().optional(),
    accountId: z.string().uuid().optional(),
    contactId: z.string().uuid().optional(),
    items: z.array(CreateSalesOrderItemSchema).max(200).optional(),
  })
  .refine((dto) => Boolean(dto.quoteId) !== Boolean(dto.accountId), {
    message: 'Ya bir teklif ya da bir firma secilmelidir (ikisi birden degil).',
    path: ['accountId'],
  })
  .refine(
    (dto) => Boolean(dto.quoteId) || (dto.items && dto.items.length > 0),
    {
      message: 'En az bir kalem eklemelisiniz.',
      path: ['items'],
    },
  );
export type CreateSalesOrderDto = z.infer<typeof CreateSalesOrderSchema>;

export const SalesOrderQuerySchema = ListQuerySchema.extend({
  accountId: z.string().uuid().optional(),
  status: SalesOrderStatusSchema.optional(),
});
export type SalesOrderQueryDto = z.infer<typeof SalesOrderQuerySchema>;
