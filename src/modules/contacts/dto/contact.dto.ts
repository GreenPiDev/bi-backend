import { z } from 'zod';
import { ListQuerySchema } from '../../../core/dto/list-query.dto';

export const CreateContactSchema = z.object({
  firstName: z.string().trim().min(1, 'Ad zorunludur.'),
  lastName: z.string().trim().min(1, 'Soyad zorunludur.'),
  accountId: z.string().uuid().optional(),
  title: z.string().trim().max(200).optional(),
  email: z
    .string()
    .trim()
    .email('Gecersiz e-posta.')
    .optional()
    .or(z.literal('')),
  phone: z.string().trim().max(50).optional(),
  ownerId: z.string().uuid().optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
});
export type CreateContactDto = z.infer<typeof CreateContactSchema>;

export const UpdateContactSchema = CreateContactSchema.partial();
export type UpdateContactDto = z.infer<typeof UpdateContactSchema>;

export const ContactQuerySchema = ListQuerySchema.extend({
  accountId: z.string().optional(),
  ownerId: z.string().optional(),
});
export type ContactQueryDto = z.infer<typeof ContactQuerySchema>;
