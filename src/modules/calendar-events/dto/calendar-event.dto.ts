import { z } from 'zod';

const AttendeeSchema = z.object({
  userId: z.string().uuid(),
  note: z.string().trim().max(1000).optional(),
});

export const CreateCalendarEventSchema = z
  .object({
    title: z.string().trim().min(2, 'Baslik en az 2 karakter olmalidir.'),
    description: z.string().trim().max(2000).optional(),
    startAt: z.coerce.date(),
    endAt: z.coerce.date(),
    allDay: z.boolean().optional(),
    /** T2: bos birakilirsa olusturan kullanici tek katilimci olarak eklenir. */
    attendees: z.array(AttendeeSchema).max(50).optional(),
  })
  .refine((dto) => dto.endAt >= dto.startAt, {
    message: 'Bitis tarihi baslangictan once olamaz.',
    path: ['endAt'],
  });
export type CreateCalendarEventDto = z.infer<typeof CreateCalendarEventSchema>;

export const UpdateCalendarEventSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(2, 'Baslik en az 2 karakter olmalidir.')
      .optional(),
    description: z.string().trim().max(2000).optional(),
    startAt: z.coerce.date().optional(),
    endAt: z.coerce.date().optional(),
    allDay: z.boolean().optional(),
    attendees: z.array(AttendeeSchema).max(50).optional(),
  })
  .refine((dto) => !dto.startAt || !dto.endAt || dto.endAt >= dto.startAt, {
    message: 'Bitis tarihi baslangictan once olamaz.',
    path: ['endAt'],
  });
export type UpdateCalendarEventDto = z.infer<typeof UpdateCalendarEventSchema>;

export const CalendarEventQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  /** T3: "bizimle ilgili" ters kronolojik liste gorunumu icin. Ay gorunumu asc kullanir. */
  order: z.enum(['asc', 'desc']).default('asc'),
});
export type CalendarEventQueryDto = z.infer<typeof CalendarEventQuerySchema>;
