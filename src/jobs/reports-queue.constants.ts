export const REPORTS_QUEUE = 'reports';
export const SEND_REPORT_JOB = 'send-report';

export interface SendReportJobPayload {
  reportId: string;
}
