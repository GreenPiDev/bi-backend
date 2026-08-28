import { z } from 'zod';
import { isValidTaxNumber } from '../../../core/validators/tax';
import { ListQuerySchema } from '../../../core/dto/list-query.dto';

export const AccountTypeSchema = z.enum(['CUSTOMER', 'SUPPLIER']);

export const CreateAccountSchema = z.object({
  name: z.string().trim().min(2, 'Firma adi en az 2 karakter olmalidir.'),
  taxNumber: z
    .string()
    .trim()
    .refine((v) => v === '' || isValidTaxNumber(v), 'Gecersiz vergi/TC no.')
    .optional(),
  taxOffice: z.string().trim().max(200).optional(),
  sector: z.string().trim().max(200).optional(),
  accountTypes: z.array(AccountTypeSchema).max(2).optional(),
  website: z
    .string()
    .trim()
    .url('Gecersiz web adresi.')
    .optional()
    .or(z.literal('')),
  phone: z.string().trim().max(50).optional(),
  email: z
    .string()
    .trim()
    .email('Gecersiz e-posta.')
    .optional()
    .or(z.literal('')),
  address: z.string().trim().max(500).optional(),
  city: z.string().trim().max(200).optional(),
  ownerId: z.string().uuid().optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
});
export type CreateAccountDto = z.infer<typeof CreateAccountSchema>;

export const UpdateAccountSchema = CreateAccountSchema.partial();
export type UpdateAccountDto = z.infer<typeof UpdateAccountSchema>;

export const AccountQuerySchema = ListQuerySchema.extend({
  city: z.string().optional(),
  sector: z.string().optional(),
  ownerId: z.string().optional(),
});
export type AccountQueryDto = z.infer<typeof AccountQuerySchema>;
