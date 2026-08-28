/**
 * Sabit navigasyon niyetleri. LLM asla serbest metin bir path uretmez -
 * sadece bu enum'dan birini secip (gerekirse) bir hedef ad soyler.
 * Yeni bir yonlendirilebilir ekran eklenince buraya bir satir eklenir.
 */
export const NAVIGATION_INTENTS = [
  'dashboards_list',
  'dashboard_view',
  'datasets_list',
  'dataset_view',
  'settings',
  'profile',
] as const;
export type NavigationIntent = (typeof NAVIGATION_INTENTS)[number];

export interface NamedEntity {
  id: string;
  name: string;
}

export interface NavigationResult {
  path: string | null;
  /** Kullanicidan gizlenmeyen, modele geri beslenecek Turkce aciklama. */
  reason: string;
}

function findByName(
  entities: NamedEntity[],
  targetName: string | undefined,
): NamedEntity | undefined {
  if (!targetName) return undefined;
  const needle = targetName.trim().toLocaleLowerCase('tr-TR');
  return entities.find((e) =>
    e.name.toLocaleLowerCase('tr-TR').includes(needle),
  );
}

/**
 * Rol bazli whitelist + tenant'a ait varlik listesine gore intent'i gercek
 * bir path'e cevirir. `platform-admin` bilerek listede yok - chatbot bu
 * gizli ekrani asla onermez.
 */
export function resolveNavigation(
  intent: NavigationIntent,
  targetName: string | undefined,
  canViewSettings: boolean,
  dashboards: NamedEntity[],
  datasets: NamedEntity[],
): NavigationResult {
  switch (intent) {
    case 'dashboards_list':
      return {
        path: '/dashboards',
        reason: 'Panolar listesine yonlendirildi.',
      };
    case 'datasets_list':
      return {
        path: '/datasets',
        reason: 'Veri kumeleri listesine yonlendirildi.',
      };
    case 'profile':
      return { path: '/profile', reason: 'Profil sayfasina yonlendirildi.' };
    case 'settings':
      if (!canViewSettings) {
        return {
          path: null,
          reason:
            'Bu kullanicinin rolu ayarlar sayfasina erisime izin vermiyor.',
        };
      }
      return { path: '/settings', reason: 'Ayarlar sayfasina yonlendirildi.' };
    case 'dashboard_view': {
      const match = findByName(dashboards, targetName);
      if (!match) {
        return {
          path: null,
          reason: `"${targetName ?? ''}" adinda bir pano bulunamadi.`,
        };
      }
      return {
        path: `/dashboards/${match.id}`,
        reason: `"${match.name}" panosuna yonlendirildi.`,
      };
    }
    case 'dataset_view': {
      const match = findByName(datasets, targetName);
      if (!match) {
        return {
          path: null,
          reason: `"${targetName ?? ''}" adinda bir veri kumesi bulunamadi.`,
        };
      }
      return {
        path: `/datasets/${match.id}`,
        reason: `"${match.name}" veri kumesine yonlendirildi.`,
      };
    }
  }
}
