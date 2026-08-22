import { z } from 'zod';

/** Standart 5 alanli cron ifadesi (dakika saat gun ay hafta-gunu) - saniye alani yok. */
const CRON_REGEX =
  /^(\*|[0-9,\-/]+)\s+(\*|[0-9,\-/]+)\s+(\*|[0-9,\-/]+)\s+(\*|[0-9,\-/]+)\s+(\*|[0-9,\-/]+)$/;

export const CreateScheduledReportSchema = z.object({
  dashboardId: z.string().uuid(),
  cron: z.string().regex(CRON_REGEX, {
    message:
      'Gecerli bir cron ifadesi girin (orn. "0 8 * * 1" - her Pazartesi saat 08:00).',
  }),
  recipients: z.array(z.string().email()).min(1).max(20),
  isActive: z.boolean().default(true),
});
export type CreateScheduledReportDto = z.infer<
  typeof CreateScheduledReportSchema
>;

export const UpdateScheduledReportSchema = z.object({
  cron: z.string().regex(CRON_REGEX).optional(),
  recipients: z.array(z.string().email()).min(1).max(20).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateScheduledReportDto = z.infer<
  typeof UpdateScheduledReportSchema
>;
