export const POST_SALE_FOLLOWUP_QUEUE = 'post-sale-followup';
export const CHECK_POST_SALE_FOLLOWUP_JOB = 'check-post-sale-followup';
export const POST_SALE_FOLLOWUP_SCHEDULER_ID = 'post-sale-followup-check';

/** S2: gunde bir kez calisir, reminderAt'i gecmis ve henuz hatirlatilmamis
 * PostSaleCase kayitlarini tarar (bkz. docs/VARSAYIMLAR.md V28). */
export const POST_SALE_FOLLOWUP_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
