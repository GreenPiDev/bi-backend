import { z } from 'zod';
import { ListQuerySchema } from '../../../core/dto/list-query.dto';
import { OpportunityStageSchema } from '../../opportunities/dto/opportunity.dto';

export const InteractionTypeSchema = z.enum([
  'CALL',
  'VISIT',
  'MEETING',
  'EMAIL',
  'OTHER',
]);

const ParticipantSchema = z.object({
  name: z.string().trim().min(1),
  isInternal: z.boolean(),
  note: z.string().trim().max(1000).optional(),
});

/** M3/O1: checkbox isaretlenince doldurulan gomulu firsat alanlari. */
const NestedOpportunitySchema = z.object({
  name: z.string().trim().min(2, 'Firsat adi en az 2 karakter olmalidir.'),
  stage: OpportunityStageSchema.optional(),
  estimatedValue: z.number().nonnegative().optional(),
});

/** M4-M6: hatirlatma - her atanan kullaniciya kendi notu, M9 gecmis tarih kisitina
 * service katmaninda bakilir (create aninin "simdi"sine gore, occurredAt'a degil). */
const ReminderSchema = z.object({
  startAt: z.coerce.date(),
  title: z.string().trim().max(200).optional(),
  assignees: z
    .array(
      z.object({
        userId: z.string().uuid(),
        note: z.string().trim().max(1000).optional(),
      }),
    )
    .min(1)
    .max(50),
});

export const CreateInteractionSchema = z
  .object({
    accountId: z.string().uuid().optional(),
    /** M2: bilinmeyen firma - serbest metin, otomatik cari olusturur. */
    accountName: z.string().trim().min(1).optional(),
    contactId: z.string().uuid().optional(),
    /** M1: bilinmeyen kisi - serbest metin, otomatik kontak olusturur. */
    contactName: z.string().trim().min(1).optional(),
    type: InteractionTypeSchema,
    notes: z.string().trim().min(1, 'Notlar bos birakilamaz.'),
    occurredAt: z.coerce.date(),
    participants: z.array(ParticipantSchema).max(20).optional(),
    opportunity: NestedOpportunitySchema.optional(),
    reminder: ReminderSchema.optional(),
  })
  .refine((dto) => Boolean(dto.accountId) !== Boolean(dto.accountName), {
    message: 'accountId veya accountName alanlarindan tam biri verilmelidir.',
    path: ['accountId'],
  })
  .refine((dto) => !(dto.contactId && dto.contactName), {
    message: 'contactId ve contactName ayni anda verilemez.',
    path: ['contactId'],
  });
export type CreateInteractionDto = z.infer<typeof CreateInteractionSchema>;

export const UpdateInteractionSchema = z.object({
  type: InteractionTypeSchema.optional(),
  notes: z.string().trim().min(1).optional(),
  occurredAt: z.coerce.date().optional(),
  status: z.enum(['OPEN', 'CLOSED']).optional(),
});
export type UpdateInteractionDto = z.infer<typeof UpdateInteractionSchema>;

export const InteractionQuerySchema = ListQuerySchema.extend({
  accountId: z.string().uuid().optional(),
  status: z.enum(['OPEN', 'CLOSED']).optional(),
});
export type InteractionQueryDto = z.infer<typeof InteractionQuerySchema>;
