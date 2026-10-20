import { z } from 'zod';

const AnswerSchema = z.object({
  questionId: z.string().uuid(),
  answerText: z.string().trim().max(5000).optional(),
  answerOptionId: z.string().uuid().optional(),
  answerLikertValue: z.number().int().min(1).max(5).optional(),
});

export const SubmitSurveyResponseSchema = z.object({
  answers: z.array(AnswerSchema).max(50),
});
export type SubmitSurveyResponseDto = z.infer<
  typeof SubmitSurveyResponseSchema
>;
