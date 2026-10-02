import { z } from 'zod';

/** K2: 180 gun iletisim kurulmama bildirimi esigi (gun). */
export const CONTACT_INACTIVITY_THRESHOLD_DAYS_KEY =
  'crm.contactInactivityThresholdDays';
export const DEFAULT_CONTACT_INACTIVITY_THRESHOLD_DAYS = 180;

/** S2: teklif onaylandiktan kac gun sonra satis sonrasi hatirlatmasi gonderilecegi
 * (bkz. docs/VARSAYIMLAR.md V28). */
export const POST_SALE_FOLLOW_UP_DAYS_KEY = 'crm.postSaleFollowUpDays';
export const DEFAULT_POST_SALE_FOLLOW_UP_DAYS = 14;

/** Q4: yeni teklif kalemi eklenirken KDV alanina varsayilan olarak gelecek oran (%). */
export const DEFAULT_QUOTE_VAT_PCT_KEY = 'crm.defaultQuoteVatPct';
export const DEFAULT_QUOTE_VAT_PCT = 20;

/** Teklif formundaki (`/teklifler/yeni`) dort kosul metni alaninin varsayilan
 * degerleri - burada tanimlanir, teklif olustururken dolu gelir ve kullanici
 * uzerinde degisiklik yapabilir (bkz. docs/VARSAYIMLAR.md). */
export const DEFAULT_QUOTE_PAYMENT_TERMS_KEY = 'crm.defaultQuotePaymentTerms';
export const DEFAULT_QUOTE_SALES_TERMS_KEY = 'crm.defaultQuoteSalesTerms';
export const DEFAULT_QUOTE_DELIVERY_TERMS_KEY = 'crm.defaultQuoteDeliveryTerms';
export const DEFAULT_QUOTE_GENERAL_TERMS_KEY = 'crm.defaultQuoteGeneralTerms';
export const DEFAULT_QUOTE_TERMS_TEXT = '';

/**
 * Tenant'in ayarlayabilecegi bilinen anahtarlarin tek kaynagi. Yeni bir ayar
 * eklerken buraya bir satir eklemek yeterli; bilinmeyen anahtara PATCH 400 doner.
 */
export const KNOWN_TENANT_SETTINGS = {
  [CONTACT_INACTIVITY_THRESHOLD_DAYS_KEY]: {
    schema: z.number().int().min(1).max(3650),
    default: DEFAULT_CONTACT_INACTIVITY_THRESHOLD_DAYS,
  },
  [POST_SALE_FOLLOW_UP_DAYS_KEY]: {
    schema: z.number().int().min(1).max(3650),
    default: DEFAULT_POST_SALE_FOLLOW_UP_DAYS,
  },
  [DEFAULT_QUOTE_VAT_PCT_KEY]: {
    schema: z.number().min(0).max(100),
    default: DEFAULT_QUOTE_VAT_PCT,
  },
  [DEFAULT_QUOTE_PAYMENT_TERMS_KEY]: {
    schema: z.string().max(5000),
    default: DEFAULT_QUOTE_TERMS_TEXT,
  },
  [DEFAULT_QUOTE_SALES_TERMS_KEY]: {
    schema: z.string().max(5000),
    default: DEFAULT_QUOTE_TERMS_TEXT,
  },
  [DEFAULT_QUOTE_DELIVERY_TERMS_KEY]: {
    schema: z.string().max(5000),
    default: DEFAULT_QUOTE_TERMS_TEXT,
  },
  [DEFAULT_QUOTE_GENERAL_TERMS_KEY]: {
    schema: z.string().max(5000),
    default: DEFAULT_QUOTE_TERMS_TEXT,
  },
} as const;

export type KnownTenantSettingKey = keyof typeof KNOWN_TENANT_SETTINGS;

export function isKnownSettingKey(key: string): key is KnownTenantSettingKey {
  return key in KNOWN_TENANT_SETTINGS;
}
