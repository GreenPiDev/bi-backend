import { z } from 'zod';

const part = (max: number) => z.number().int().min(0).max(max);

/** Duration counted from "now" (days/hours/minutes); at least one part must be > 0. */
export const ExtendDemoUserSchema = z
  .object({
    days: part(365),
    hours: part(23),
    minutes: part(59),
  })
  .refine((value) => value.days + value.hours + value.minutes > 0, {
    message: 'Süre sıfırdan büyük olmalı.',
  });

export type ExtendDemoUserDto = z.infer<typeof ExtendDemoUserSchema>;
