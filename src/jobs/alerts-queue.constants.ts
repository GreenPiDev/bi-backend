export const ALERTS_QUEUE = 'alerts';
export const CHECK_ALERTS_JOB = 'check-alerts';
export const ALERTS_SCHEDULER_ID = 'alerts-check';

export const ALERT_CHECK_INTERVAL_MS = 15 * 60 * 1000;
/** Ayni alarm 24 saat icinde tekrar tetiklenmis olsa bile yeniden e-posta atmaz -
 * esik degeri asili kaldigi surece her 15 dakikada bir spam gonderilmesini onler. */
export const ALERT_COOLDOWN_MS = 24 * 60 * 60 * 1000;
