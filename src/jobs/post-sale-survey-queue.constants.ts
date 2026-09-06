export const POST_SALE_SURVEY_QUEUE = 'post-sale-survey';
export const SEND_POST_SALE_SURVEY_JOB = 'send-post-sale-survey';

export interface SendPostSaleSurveyJobPayload {
  postSaleCaseId: string;
}
