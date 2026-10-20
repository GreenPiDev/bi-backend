import { z } from 'zod';
import { ListQuerySchema } from '../../../core/dto/list-query.dto';

export const SalesOrderStatusSchema = z.enum([
  'PENDING',
  'PROCESSING',
  'READY_FOR_SHIPMENT',
  'SHIPPED',
  'PARTIALLY_DELIVERED',
  'DELIVERED',
  'COMPLETED',
  'CANCELLED',
]);

export const UpdateSalesOrderSchema = z.object({
  status: SalesOrderStatusSchema,
});
export type UpdateSalesOrderDto = z.infer<typeof UpdateSalesOrderSchema>;

/** Teklifsiz (manuel) siparis kalemi - bkz. SalesOrderItem model doc comment'i.
 * currency/discountPct/vatPct/brand QuoteItem ile ayni "bos birakilirsa urunden
 * kopyalanir, verilirse ezilir" deseniyle opsiyonel (bkz. SalesOrdersService.
 * resolveItems). */
const CreateSalesOrderItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  currency: z.string().optional(),
  discountPct: z.number().min(0).max(100).optional(),
  vatPct: z.number().min(0).max(100).optional(),
  brand: z.string().max(120).optional(),
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

/** Ad-hoc (2026-10-19, kullanici istegi, bkz. CLAUDE.md): kismi sevkiyat/geri
 * alma - tek bir "deliveredQuantity'yi su degere esitle" uzerinden (bkz.
 * SalesOrdersService.setItemDeliveredQuantity doc comment'i). */
export const SetSalesOrderItemDeliveredQuantitySchema = z.object({
  deliveredQuantity: z.number().min(0),
});
export type SetSalesOrderItemDeliveredQuantityDto = z.infer<
  typeof SetSalesOrderItemDeliveredQuantitySchema
>;

/** Ad-hoc (2026-10-19, kullanici istegi, bkz. CLAUDE.md): kalemi "musteriye
 * gonderilmeyecek" olarak isaretleme/geri alma (bkz. SalesOrdersService.
 * setItemCancelled doc comment'i). */
export const SetSalesOrderItemCancelledSchema = z.object({
  isCancelled: z.boolean(),
});
export type SetSalesOrderItemCancelledDto = z.infer<
  typeof SetSalesOrderItemCancelledSchema
>;

export const SalesOrderQuerySchema = ListQuerySchema.extend({
  accountId: z.string().uuid().optional(),
  status: SalesOrderStatusSchema.optional(),
  /** /settings/kullanicilar/:slug "Oluşturduğu Satış Siparişleri" grafiginden
   * filtrelenmis sekilde gelindiginde (bkz. UserStatsPage) tek bir kullaniciya
   * daraltmak icin. */
  createdById: z.string().optional(),
  /** Olusturulma tarihi filtresi (liste sayfasi filtre penceresi) - hem tek tarih
   * ("su tarihten itibaren") hem aralik ("iki tarih arasi") secimi frontend'de bu
   * ayni from/to ciftine cevrilir - bkz. interaction.dto.ts'teki ayni desen. */
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type SalesOrderQueryDto = z.infer<typeof SalesOrderQuerySchema>;
