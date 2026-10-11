export const STOCK_HOLDING_COST_QUEUE = 'stock-holding-cost';
export const APPLY_STOCK_HOLDING_COST_JOB = 'apply-stock-holding-cost';
export const STOCK_HOLDING_COST_SCHEDULER_ID = 'stock-holding-cost-daily';

/** Kullanici ile netlesen saat: her gun gece 00:30, Europe/Istanbul (bkz.
 * docs/VARSAYIMLAR.md). */
export const STOCK_HOLDING_COST_CRON_PATTERN = '30 0 * * *';
export const STOCK_HOLDING_COST_TZ = 'Europe/Istanbul';

/** Bu islemin bir insan kullanici degil zamanlanmis bir is tarafindan
 * yapildigini isaretlemek icin - check-alerts.processor.ts'teki
 * 'system-alerts' ile ayni desen (StockMovement.createdById bir FK degil,
 * duz string). */
export const STOCK_HOLDING_COST_SYSTEM_ACTOR_ID = 'system-stock-holding-cost';
