/** VIEW ayrica "Sayfa Erisimleri" (gorunurluk) sekmesinde yonetilir, bu listede yer almaz. */
export type CrudPermissionAction =
  'CREATE' | 'UPDATE' | 'DELETE' | 'IMPORT' | 'EXPORT';

export interface PageTabDefinition {
  key: string;
  label: string;
  /** Bu tab'da yonetilebilecek CRUD/aksiyon izinleri - "Islem Izinleri" matrisinin
   * sutunlarini belirler. Bos/tanimsizsa bu tab'da yonetilecek bir aksiyon yoktur
   * (orn. sadece VIEW ile calisan salt-okunur ekranlar). */
  supportedActions?: readonly CrudPermissionAction[];
}

export interface PageDefinition {
  key: string;
  label: string;
  tabs?: readonly PageTabDefinition[];
  /** true ise sayfa Permission kontrolune tabi degildir, herkes gorur (orn. /profile). */
  alwaysVisible?: boolean;
  /** dolu ise sayfa ayrica ModuleGuard/RequiresModule ile de korunur (bkz. module-registry.ts). */
  requiresModule?: string;
  /** bkz. PageTabDefinition.supportedActions - tab'i olmayan sayfalar icin. */
  supportedActions?: readonly CrudPermissionAction[];
}

/**
 * Sayfa/tab erisiminin tek kaynagi. Yeni bir sayfa veya tab eklendiginde yapilmasi
 * gereken tek sey buraya bir satir eklemek - rol/izin yonetimi ekrani ve nav filtreleme
 * bu listeyi GET /page-registry uzerinden dinamik olarak okur (bkz. docs/PLAN_ROL_YONETIMI.md).
 */
export const PAGE_REGISTRY: readonly PageDefinition[] = [
  {
    key: 'dashboards',
    label: 'Panolar',
    supportedActions: ['CREATE', 'UPDATE', 'DELETE', 'EXPORT'],
  },
  {
    key: 'datasets',
    label: 'Veri Kumeleri',
    supportedActions: ['CREATE', 'UPDATE'],
  },
  {
    key: 'accounts',
    label: 'Firmalar',
    requiresModule: 'crm',
    supportedActions: ['CREATE', 'UPDATE', 'DELETE', 'IMPORT', 'EXPORT'],
  },
  {
    key: 'contacts',
    label: 'Kisiler',
    requiresModule: 'crm',
    supportedActions: ['CREATE', 'UPDATE', 'DELETE', 'IMPORT', 'EXPORT'],
  },
  { key: 'profile', label: 'Profil', alwaysVisible: true },
  {
    key: 'settings',
    label: 'Ayarlar',
    tabs: [
      {
        key: 'general',
        label: 'Genel',
        supportedActions: ['CREATE', 'UPDATE', 'DELETE'],
      },
      {
        key: 'crm',
        label: 'CRM Ayarlari',
        supportedActions: ['CREATE', 'UPDATE', 'DELETE'],
      },
      { key: 'audit', label: 'Kullanici Aktiviteleri' },
      { key: 'roles', label: 'Roller' },
      { key: 'pageAccess', label: 'Sayfa Erisimleri' },
      { key: 'actionPermissions', label: 'Islem Izinleri' },
      { key: 'users', label: 'Kullanicilar' },
    ],
  },
];

export function findPageDefinition(key: string): PageDefinition | undefined {
  return PAGE_REGISTRY.find((page) => page.key === key);
}

export function isKnownPageKey(key: string): boolean {
  return findPageDefinition(key) !== undefined;
}

export function isKnownTabKey(pageKey: string, tabKey: string): boolean {
  const page = findPageDefinition(pageKey);
  return page?.tabs?.some((tab) => tab.key === tabKey) ?? false;
}
