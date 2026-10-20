import { z } from 'zod';
import { ListQuerySchema } from '../../../core/dto/list-query.dto';

export const SurveyQuestionTypeSchema = z.enum([
  'MULTIPLE_CHOICE',
  'OPEN_ENDED',
  'LIKERT',
]);

const SurveyQuestionOptionSchema = z.object({
  label: z.string().trim().min(1, 'Secenek metni bos birakilamaz.').max(300),
});

/** MULTIPLE_CHOICE icin en az 2 secenek zorunlu, diger tiplerde options yok sayilir. */
const SurveyQuestionSchema = z
  .object({
    type: SurveyQuestionTypeSchema,
    text: z
      .string()
      .trim()
      .min(2, 'Soru metni en az 2 karakter olmalidir.')
      .max(1000),
    required: z.boolean().optional().default(true),
    options: z.array(SurveyQuestionOptionSchema).max(20).optional(),
  })
  .refine(
    (q) => q.type !== 'MULTIPLE_CHOICE' || (q.options?.length ?? 0) >= 2,
    {
      message: 'Coktan secmeli sorularda en az 2 secenek olmalidir.',
      path: ['options'],
    },
  );

export const CreateSurveySchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Anket adi en az 2 karakter olmalidir.')
    .max(200),
  description: z.string().trim().max(2000).optional(),
  isActive: z.boolean().optional().default(true),
  questions: z
    .array(SurveyQuestionSchema)
    .min(1, 'En az bir soru eklenmelidir.')
    .max(50),
});
export type CreateSurveyDto = z.infer<typeof CreateSurveySchema>;

export const UpdateSurveySchema = z.object({
  name: z.string().trim().min(2).max(200).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  isActive: z.boolean().optional(),
  questions: z.array(SurveyQuestionSchema).min(1).max(50).optional(),
});
export type UpdateSurveyDto = z.infer<typeof UpdateSurveySchema>;

export const SurveyQuerySchema = ListQuerySchema;
export type SurveyQueryDto = z.infer<typeof SurveyQuerySchema>;
