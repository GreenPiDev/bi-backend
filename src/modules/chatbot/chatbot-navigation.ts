import { findModuleDefinition } from '../../core/modules/module-registry';
import type { PageModulesService } from '../../core/modules/page-modules.service';
import { hasPermission } from '../../core/permissions/permission.types';
import type { EffectivePermissionSet } from '../../core/permissions/permission.types';
import type { PrismaService } from '../../core/prisma/prisma.service';
import {
  CHATBOT_PAGE_CATALOG,
  findChatbotPage,
  type ChatbotPageEntry,
  type ChatbotPageTab,
} from './chatbot-page-catalog';

/**
 * Sabit navigasyon niyetleri. LLM asla serbest metin bir path uretmez - sadece bu
 * listeden birini secer (gerekirse bir tab/status/targetName ekler). `dashboard_view` ve
 * `dataset_view` disindakiler chatbot-page-catalog.ts'teki statik sayfa katalogundan
 * geliyor - yeni bir sayfa eklenince once orasi guncellenir, sonra buraya satir eklenir
 * (chatbot-navigation.spec.ts ikisinin senkron kalmasini test eder).
 */
export const NAVIGATION_INTENTS = [
  'home',
  'accounts',
  'contacts',
  'interactions',
  'calendar',
  'messages',
  'projects',
  'quotes',
  'orders',
  'post-sale',
  'opportunities',
  'inventory',
  'reports',
  'drawing-settings',
  'datasets',
  'dashboards',
  'profile',
  'settings',
  'dashboard_view',
  'dataset_view',
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

export interface NavigationAccessDeps {
  tenantId: string;
  effective: EffectivePermissionSet;
  prisma: PrismaService;
  pageModules: PageModulesService;
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

async function isPageKeyAccessible(
  pageKey: string,
  tabKeyForPermission: string | undefined,
  deps: NavigationAccessDeps,
): Promise<boolean> {
  if (!hasPermission(deps.effective, pageKey, 'VIEW', tabKeyForPermission)) {
    return false;
  }
  const moduleKeys = await deps.pageModules.getModuleKeysForPage(pageKey);
  if (moduleKeys.length === 0) return true;
  if (moduleKeys.some((key) => findModuleDefinition(key)?.alwaysOn)) {
    return true;
  }
  const enabled = await deps.prisma.tenantModule.findFirst({
    where: {
      tenantId: deps.tenantId,
      moduleKey: { in: moduleKeys },
      disabledAt: null,
    },
  });
  return !!enabled;
}

async function isEntryAccessible(
  entry: ChatbotPageEntry,
  deps: NavigationAccessDeps,
): Promise<boolean> {
  if (entry.alwaysVisible) return true;
  const pageKeys = entry.pageKeys ?? [];
  if (pageKeys.length === 0) return true;
  for (const pageKey of pageKeys) {
    if (await isPageKeyAccessible(pageKey, undefined, deps)) return true;
  }
  return false;
}

/**
 * `settings` sayfasinin tab'lari gercek Permission tabKey'leriyle yonetiliyor (bkz.
 * core/modules/page-registry.ts), diger tum tab'li sayfalarda (envanter, teklifler, ...)
 * her tab kendi BAGIMSIZ pageKey'ine sahip - bu yuzden tabKey'i izin kontrolune sadece
 * settings icin geciyoruz.
 */
async function isTabAccessible(
  entry: ChatbotPageEntry,
  tab: ChatbotPageTab,
  deps: NavigationAccessDeps,
): Promise<boolean> {
  if (entry.alwaysVisible) return true;
  if (tab.pageKeys.length === 0) return true;
  const tabKeyForPermission = entry.key === 'settings' ? tab.key : undefined;
  for (const pageKey of tab.pageKeys) {
    if (await isPageKeyAccessible(pageKey, tabKeyForPermission, deps))
      return true;
  }
  return false;
}

async function resolveCatalogEntry(
  pageKey: string,
  tabKey: string | undefined,
  status: string | undefined,
  deps: NavigationAccessDeps,
): Promise<NavigationResult> {
  const entry = findChatbotPage(pageKey);
  if (!entry) {
    return { path: null, reason: `"${pageKey}" adinda bir sayfa bulunamadi.` };
  }
  if (!(await isEntryAccessible(entry, deps))) {
    return {
      path: null,
      reason: `Bu kullanicinin "${entry.label}" sayfasina erisim yetkisi yok (rol yetersiz veya modul kapali).`,
    };
  }

  let activeTab: ChatbotPageTab | undefined;
  if (tabKey) {
    activeTab = entry.tabs?.find((tab) => tab.key === tabKey);
    if (!activeTab) {
      return {
        path: null,
        reason: `"${entry.label}" sayfasinda "${tabKey}" adinda bir sekme yok.`,
      };
    }
    if (!(await isTabAccessible(entry, activeTab, deps))) {
      return {
        path: null,
        reason: `Bu kullanicinin "${entry.label}" > "${activeTab.label}" sekmesine erisim yetkisi yok.`,
      };
    }
  }

  const params = new URLSearchParams();
  if (activeTab) params.set('tab', activeTab.key);
  if (status) {
    const allowedValues = activeTab?.statusValues ?? entry.statusValues;
    if (!allowedValues || !allowedValues.includes(status)) {
      return {
        path: null,
        reason: `"${status}" bu sayfa/sekme icin gecerli bir durum degeri degil.`,
      };
    }
    params.set('status', status);
  }

  const query = params.toString();
  const tabSuffix = activeTab ? ` > "${activeTab.label}"` : '';
  return {
    path: query ? `${entry.path}?${query}` : entry.path,
    reason: `"${entry.label}"${tabSuffix} sayfasina yonlendirildi.`,
  };
}

/**
 * Intent'i gercek bir path'e cevirir. `dashboard_view`/`dataset_view` isim bazli arama
 * gerektirdigi icin (bkz. targetName), ayri ele alinir - digerleri statik katalogdan gelir.
 * `platform-admin` bilerek listede yok - chatbot bu gizli ekrani asla onermez.
 */
export async function resolveNavigation(
  intent: NavigationIntent,
  targetName: string | undefined,
  tabKey: string | undefined,
  status: string | undefined,
  dashboards: NamedEntity[],
  datasets: NamedEntity[],
  deps: NavigationAccessDeps,
): Promise<NavigationResult> {
  if (intent === 'dashboard_view') {
    const accessible = await isEntryAccessible(
      findChatbotPage('dashboards')!,
      deps,
    );
    if (!accessible) {
      return {
        path: null,
        reason:
          'Bu kullanicinin panolara erisim yetkisi yok (rol yetersiz veya modul kapali).',
      };
    }
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

  if (intent === 'dataset_view') {
    const accessible = await isEntryAccessible(
      findChatbotPage('datasets')!,
      deps,
    );
    if (!accessible) {
      return {
        path: null,
        reason:
          'Bu kullanicinin veri kumelerine erisim yetkisi yok (rol yetersiz veya modul kapali).',
      };
    }
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

  return resolveCatalogEntry(intent, tabKey, status, deps);
}

export { CHATBOT_PAGE_CATALOG };
