import { z } from 'zod';
import { ListQuerySchema } from '../../../core/dto/list-query.dto';
import { ExportColumnsQuerySchema } from '../../../core/xlsx/list-export.util';

export const ContactStatusSchema = z.enum(['ACTIVE', 'INACTIVE']);

export const CreateContactSchema = z.object({
  firstName: z.string().trim().min(1, 'Ad zorunludur.'),
  lastName: z.string().trim().min(1, 'Soyad zorunludur.'),
  accountId: z.string().uuid().optional(),
  department: z.string().trim().max(200).optional(),
  title: z.string().trim().max(200).optional(),
  email: z
    .string()
    .trim()
    .email('Gecersiz e-posta.')
    .optional()
    .or(z.literal('')),
  phone: z.string().trim().max(50).optional(),
  extension: z.string().trim().max(20).optional(),
  ownerId: z.string().uuid().optional(),
  status: ContactStatusSchema.optional(),
  lastContactedAt: z.coerce.date().optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
});
export type CreateContactDto = z.infer<typeof CreateContactSchema>;

export const UpdateContactSchema = CreateContactSchema.partial();
export type UpdateContactDto = z.infer<typeof UpdateContactSchema>;

export const ContactQuerySchema = ListQuerySchema.extend({
  accountId: z.string().optional(),
  ownerId: z.string().optional(),
  status: ContactStatusSchema.optional(),
  /** Kaydi olusturan kullaniciya gore filtre (liste sayfasi filtre penceresi). */
  createdById: z.string().optional(),
});
export type ContactQueryDto = z.infer<typeof ContactQuerySchema>;

/** Ad-hoc (2026-10-20, kullanici istegi, bkz. CLAUDE.md): /kisiler sayfasindaki
 * "Excel'e Aktar" butonu - accounts/sales-orders'taki ayni merkezi yapi (bkz.
 * core/xlsx/list-export.util.ts, ContactsService.exportFiltered). */
export const ContactExportQuerySchema = ContactQuerySchema.omit({
  page: true,
  pageSize: true,
  sort: true,
}).extend({
  columns: ExportColumnsQuerySchema,
});
export type ContactExportQueryDto = z.infer<typeof ContactExportQuerySchema>;
