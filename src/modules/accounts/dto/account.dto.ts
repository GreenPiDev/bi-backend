import { z } from 'zod';
import { isValidTaxNumber } from '../../../core/validators/tax';
import { ListQuerySchema } from '../../../core/dto/list-query.dto';

export const AccountTypeSchema = z.enum([
  'CUSTOMER',
  'SUPPLIER',
  'CONTRACTOR',
  'SUBCONTRACTOR',
]);

/** Firma olustururken ayni anda eklenebilen yetkili kisi (bkz. account.contact
 * nested-create, Quote'un opportunity nested-create deseniyle ayni yapida). */
export const AccountContactInputSchema = z.object({
  firstName: z.string().trim().min(1, 'Ad gereklidir.'),
  lastName: z.string().trim().min(1, 'Soyad gereklidir.'),
  department: z.string().trim().max(200).optional(),
  title: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(50).optional(),
  extension: z.string().trim().max(20).optional(),
});
export type AccountContactInputDto = z.infer<typeof AccountContactInputSchema>;

export const CreateAccountSchema = z.object({
  name: z.string().trim().min(2, 'Firma adi en az 2 karakter olmalidir.'),
  taxNumber: z
    .string()
    .trim()
    .refine((v) => v === '' || isValidTaxNumber(v), 'Gecersiz vergi/TC no.')
    .optional(),
  taxOffice: z.string().trim().max(200).optional(),
  sector: z.string().trim().max(200).optional(),
  accountTypes: z.array(AccountTypeSchema).max(4).optional(),
  website: z
    .string()
    .trim()
    .url('Gecersiz web adresi.')
    .optional()
    .or(z.literal('')),
  phone: z.string().trim().max(50).optional(),
  landlinePhone: z.string().trim().max(20).optional(),
  email: z
    .string()
    .trim()
    .email('Gecersiz e-posta.')
    .optional()
    .or(z.literal('')),
  address: z.string().trim().max(500).optional(),
  city: z.string().trim().max(200).optional(),
  district: z.string().trim().max(200).optional(),
  ownerId: z.string().uuid().optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
  contact: AccountContactInputSchema.optional(),
});
export type CreateAccountDto = z.infer<typeof CreateAccountSchema>;

export const UpdateAccountSchema = CreateAccountSchema.omit({
  contact: true,
}).partial();
export type UpdateAccountDto = z.infer<typeof UpdateAccountSchema>;

export const AccountQuerySchema = ListQuerySchema.extend({
  city: z.string().optional(),
  sector: z.string().optional(),
  ownerId: z.string().optional(),
  /** Ekleme tarihi filtresi (liste sayfasi filtre penceresi) - "su tarihten itibaren
   * / su tarihe kadar eklenenler" ya da "son N gun" secimi frontend'de "from"a
   * cevrilir. */
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type AccountQueryDto = z.infer<typeof AccountQuerySchema>;
