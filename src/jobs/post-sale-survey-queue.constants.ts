export const POST_SALE_SURVEY_QUEUE = 'post-sale-survey';
export const SEND_POST_SALE_SURVEY_JOB = 'send-post-sale-survey';

export interface SendPostSaleSurveyJobPayload {
  postSaleCaseId: string;
  surveyId: string;
  recipientKind: 'CONTACT' | 'EMAIL';
  contactId: string | null;
  recipientName: string;
  recipientEmail: string;
  /** Verilmezse processor Tenant.email'e duser. */
  fromEmail: string | null;
}
