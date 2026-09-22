import { z } from 'zod';
import { ListQuerySchema } from '../../../core/dto/list-query.dto';

export const OpportunityStageSchema = z.enum([
  'NEW',
  'QUALIFIED',
  'PROPOSAL',
  'WON',
  'LOST',
]);

export const CurrencyCodeSchema = z.enum([
  'TRY',
  'USD',
  'EUR',
  'GBP',
  'CHF',
  'JPY',
]);

/** Interactions'daki ReminderSchema ile ayni sekil - opportunity.dto.ts <-> interaction.dto.ts
 * dongusel importa girmemek icin (interaction.dto.ts zaten OpportunityStageSchema'yi buradan
 * aliyor) kasitli olarak tekrar tanimlandi. */
const OpportunityReminderSchema = z.object({
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

export const CreateOpportunitySchema = z.object({
  accountId: z.string().uuid(),
  name: z.string().trim().min(2, 'Firsat adi en az 2 karakter olmalidir.'),
  stage: OpportunityStageSchema.optional(),
  // Opportunity.estimatedValue @db.Decimal(14, 2) - DB'nin kabul edebilecegi ust sinir.
  estimatedValue: z
    .number()
    .nonnegative()
    .max(999_999_999_999.99, 'Tahmini deger cok buyuk.')
    .optional(),
  estimatedValueCurrency: CurrencyCodeSchema.optional(),
  description: z.string().trim().max(2000).optional(),
  occurredAt: z.coerce.date().optional(),
  reminder: OpportunityReminderSchema.optional(),
});
export type CreateOpportunityDto = z.infer<typeof CreateOpportunitySchema>;

export const UpdateOpportunitySchema = z.object({
  name: z.string().trim().min(2).optional(),
  stage: OpportunityStageSchema.optional(),
  // Opportunity.estimatedValue @db.Decimal(14, 2) - DB'nin kabul edebilecegi ust sinir.
  estimatedValue: z
    .number()
    .nonnegative()
    .max(999_999_999_999.99, 'Tahmini deger cok buyuk.')
    .optional(),
  estimatedValueCurrency: CurrencyCodeSchema.optional(),
  description: z.string().trim().max(2000).optional(),
  occurredAt: z.coerce.date().optional(),
});
export type UpdateOpportunityDto = z.infer<typeof UpdateOpportunitySchema>;

export const OpportunityQuerySchema = ListQuerySchema.extend({
  accountId: z.string().uuid().optional(),
  stage: OpportunityStageSchema.optional(),
  minEstimatedValue: z.coerce.number().nonnegative().optional(),
  /** Olusma tarihi filtresi (liste sayfasi filtre penceresi) - hem tek tarih ("su
   * tarihten itibaren") hem aralik ("iki tarih arasi") secimi frontend'de bu ayni
   * from/to ciftine cevrilir - bkz. accounts.dto.ts'teki ayni desen. */
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type OpportunityQueryDto = z.infer<typeof OpportunityQuerySchema>;
