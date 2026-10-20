import { z } from 'zod';
import { ListQuerySchema } from '../../../core/dto/list-query.dto';

export const PurchaseOrderStatusSchema = z.enum([
  'DRAFT',
  'CONFIRMED',
  'PARTIALLY_RECEIVED',
  'FULLY_RECEIVED',
  'COMPLETED',
  'CANCELLED',
]);
export const PurchaseOrderItemSourceSchema = z.enum(['QUOTE', 'EXTRA']);

/** Ad-hoc (2026-10-20, kullanici istegi, bkz. CLAUDE.md): SalesOrdersService ile ayni
 * desen - kismi teslim alma/geri alma AYNI bu tek uc uzerinden yapilir. */
export const SetPurchaseOrderItemReceivedQuantitySchema = z.object({
  receivedQuantity: z.number().min(0),
});
export type SetPurchaseOrderItemReceivedQuantityDto = z.infer<
  typeof SetPurchaseOrderItemReceivedQuantitySchema
>;

export const SetPurchaseOrderItemCancelledSchema = z.object({
  isCancelled: z.boolean(),
});
export type SetPurchaseOrderItemCancelledDto = z.infer<
  typeof SetPurchaseOrderItemCancelledSchema
>;

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
  /** null verilirse baslik temizlenir, hic verilmezse mevcut deger korunur. */
  title: z.string().trim().max(200).nullable().optional(),
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
  title: z.string().trim().max(200).optional(),
  items: z.array(CreatePurchaseOrderItemSchema).min(1).max(200),
  /** Cift tiklama/tekrar denemede duplicate siparis acilmamasi icin - bkz.
   * PurchaseOrdersService.create() ve schema.prisma'daki alan yorumu. */
  clientRequestId: z.string().uuid().optional(),
});
export type CreatePurchaseOrderDto = z.infer<typeof CreatePurchaseOrderSchema>;

export const PurchaseOrderQuerySchema = ListQuerySchema.extend({
  quoteId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  status: PurchaseOrderStatusSchema.optional(),
  /** /settings/kullanicilar/:slug "Oluşturduğu Satın Alma Siparişleri" grafiginden
   * filtrelenmis sekilde gelindiginde (bkz. UserStatsPage) tek bir kullaniciya
   * daraltmak icin. */
  createdById: z.string().optional(),
  /** Olusturulma tarihi filtresi (liste sayfasi filtre penceresi) - hem tek tarih
   * ("su tarihten itibaren") hem aralik ("iki tarih arasi") secimi frontend'de bu
   * ayni from/to ciftine cevrilir - bkz. interaction.dto.ts'teki ayni desen. */
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type PurchaseOrderQueryDto = z.infer<typeof PurchaseOrderQuerySchema>;
