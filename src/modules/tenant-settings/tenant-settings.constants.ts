import { z } from 'zod';

/** K2: 180 gun iletisim kurulmama bildirimi esigi (gun). */
export const CONTACT_INACTIVITY_THRESHOLD_DAYS_KEY =
  'crm.contactInactivityThresholdDays';
export const DEFAULT_CONTACT_INACTIVITY_THRESHOLD_DAYS = 180;

/**
 * Tenant'in ayarlayabilecegi bilinen anahtarlarin tek kaynagi. Yeni bir ayar
 * eklerken buraya bir satir eklemek yeterli; bilinmeyen anahtara PATCH 400 doner.
 */
export const KNOWN_TENANT_SETTINGS = {
  [CONTACT_INACTIVITY_THRESHOLD_DAYS_KEY]: {
    schema: z.number().int().min(1).max(3650),
    default: DEFAULT_CONTACT_INACTIVITY_THRESHOLD_DAYS,
  },
} as const;

export type KnownTenantSettingKey = keyof typeof KNOWN_TENANT_SETTINGS;

export function isKnownSettingKey(key: string): key is KnownTenantSettingKey {
  return key in KNOWN_TENANT_SETTINGS;
}
