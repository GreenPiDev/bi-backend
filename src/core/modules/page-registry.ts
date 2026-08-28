export interface PageTabDefinition {
  key: string;
  label: string;
}

export interface PageDefinition {
  key: string;
  label: string;
  tabs?: readonly PageTabDefinition[];
  /** true ise sayfa Permission kontrolune tabi degildir, herkes gorur (orn. /profile). */
  alwaysVisible?: boolean;
  /** dolu ise sayfa ayrica ModuleGuard/RequiresModule ile de korunur (bkz. module-registry.ts). */
  requiresModule?: string;
}

/**
 * Sayfa/tab erisiminin tek kaynagi. Yeni bir sayfa veya tab eklendiginde yapilmasi
 * gereken tek sey buraya bir satir eklemek - rol/izin yonetimi ekrani ve nav filtreleme
 * bu listeyi GET /page-registry uzerinden dinamik olarak okur (bkz. docs/PLAN_ROL_YONETIMI.md).
 */
export const PAGE_REGISTRY: readonly PageDefinition[] = [
  { key: 'dashboards', label: 'Panolar' },
  { key: 'datasets', label: 'Veri Kumeleri' },
  { key: 'accounts', label: 'Firmalar', requiresModule: 'crm' },
  { key: 'contacts', label: 'Kisiler', requiresModule: 'crm' },
  { key: 'profile', label: 'Profil', alwaysVisible: true },
  { key: 'settings', label: 'Ayarlar' },
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
