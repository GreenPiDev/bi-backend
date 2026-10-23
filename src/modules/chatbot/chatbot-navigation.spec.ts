import { describe, expect, it } from 'vitest';
import type { PageModulesService } from '../../core/modules/page-modules.service';
import type { EffectivePermission } from '../../core/permissions/permission.types';
import type { PrismaService } from '../../core/prisma/prisma.service';
import {
  NAVIGATION_INTENTS,
  resolveNavigation,
  type NavigationAccessDeps,
} from './chatbot-navigation';
import { CHATBOT_PAGE_CATALOG } from './chatbot-page-catalog';

const DASHBOARDS = [
  { id: 'd1', name: 'Satış Panosu' },
  { id: 'd2', name: 'Stok Panosu' },
];
const DATASETS = [{ id: 's1', name: 'Perakende Satış' }];

function buildDeps(
  overrides: {
    isCompanyAdmin?: boolean;
    permissions?: EffectivePermission[];
    moduleKeysByPage?: Record<string, string[]>;
    enabledModules?: string[];
  } = {},
): NavigationAccessDeps {
  const moduleKeysByPage = overrides.moduleKeysByPage ?? {};
  const enabledModules = new Set(overrides.enabledModules ?? []);
  return {
    tenantId: 't1',
    effective: {
      isCompanyAdmin: overrides.isCompanyAdmin ?? true,
      permissions: overrides.permissions ?? [],
    },
    prisma: {
      tenantModule: {
        findFirst: async ({
          where,
        }: {
          where: { moduleKey: { in: string[] } };
        }) => {
          const hit = where.moduleKey.in.some((key) => enabledModules.has(key));
          return hit ? {} : null;
        },
      },
    } as unknown as PrismaService,
    pageModules: {
      getModuleKeysForPage: async (pageKey: string) =>
        moduleKeysByPage[pageKey] ?? [],
    } as unknown as PageModulesService,
  };
}

describe('resolveNavigation', () => {
  it('settings izni yoksa ayarlar sayfasina izin vermez', async () => {
    const deps = buildDeps({ isCompanyAdmin: false, permissions: [] });
    const result = await resolveNavigation(
      'settings',
      undefined,
      undefined,
      undefined,
      DASHBOARDS,
      DATASETS,
      deps,
    );
    expect(result.path).toBeNull();
  });

  it('settings izni varsa ayarlar sayfasina izin verir', async () => {
    const deps = buildDeps({ isCompanyAdmin: true });
    const result = await resolveNavigation(
      'settings',
      undefined,
      undefined,
      undefined,
      DASHBOARDS,
      DATASETS,
      deps,
    );
    expect(result.path).toBe('/settings');
  });

  it('settings sayfasinda tabKey permission ile tab erisimi kontrol edilir', async () => {
    const deps = buildDeps({
      isCompanyAdmin: false,
      permissions: [{ pageKey: 'settings', tabKey: 'users', action: 'VIEW' }],
    });
    const allowed = await resolveNavigation(
      'settings',
      undefined,
      'users',
      undefined,
      DASHBOARDS,
      DATASETS,
      deps,
    );
    expect(allowed.path).toBe('/settings?tab=users');

    const denied = await resolveNavigation(
      'settings',
      undefined,
      'roles',
      undefined,
      DASHBOARDS,
      DATASETS,
      deps,
    );
    expect(denied.path).toBeNull();
  });

  it('bilinmeyen pano adinda null doner', async () => {
    const deps = buildDeps({ isCompanyAdmin: true });
    const result = await resolveNavigation(
      'dashboard_view',
      'olmayan pano',
      undefined,
      undefined,
      DASHBOARDS,
      DATASETS,
      deps,
    );
    expect(result.path).toBeNull();
  });

  it('kismi/kucuk-buyuk harf duyarsiz isim eslesmesiyle dogru pano pathini doner', async () => {
    const deps = buildDeps({ isCompanyAdmin: true });
    const result = await resolveNavigation(
      'dashboard_view',
      'satış',
      undefined,
      undefined,
      DASHBOARDS,
      DATASETS,
      deps,
    );
    expect(result.path).toBe('/dashboards/d1');
  });

  it('dataset_view dogru veri kumesi path ini doner', async () => {
    const deps = buildDeps({ isCompanyAdmin: true });
    const result = await resolveNavigation(
      'dataset_view',
      'Perakende',
      undefined,
      undefined,
      DASHBOARDS,
      DATASETS,
      deps,
    );
    expect(result.path).toBe('/datasets/s1');
  });

  it('izin kisiti olmayan (isCompanyAdmin) intent lerde her zaman calisir', async () => {
    const deps = buildDeps({ isCompanyAdmin: true });
    for (const intent of [
      'dashboards',
      'datasets',
      'profile',
      'home',
    ] as const) {
      const result = await resolveNavigation(
        intent,
        undefined,
        undefined,
        undefined,
        DASHBOARDS,
        DATASETS,
        deps,
      );
      expect(result.path).not.toBeNull();
    }
  });

  it('modul kapaliysa izin olsa bile yonlendirme reddedilir', async () => {
    const deps = buildDeps({
      isCompanyAdmin: true,
      moduleKeysByPage: { opportunities: ['crm'] },
      enabledModules: [],
    });
    const result = await resolveNavigation(
      'opportunities',
      undefined,
      undefined,
      undefined,
      DASHBOARDS,
      DATASETS,
      deps,
    );
    expect(result.path).toBeNull();
  });

  it('teklifler sayfasinda quotes tab + REVIZE status filtresiyle dogru path uretir', async () => {
    const deps = buildDeps({ isCompanyAdmin: true });
    const result = await resolveNavigation(
      'quotes',
      undefined,
      'quotes',
      'REVIZE',
      DASHBOARDS,
      DATASETS,
      deps,
    );
    expect(result.path).toBe('/teklifler?tab=quotes&status=REVIZE');
  });

  it('gecersiz status degeri reddedilir', async () => {
    const deps = buildDeps({ isCompanyAdmin: true });
    const result = await resolveNavigation(
      'quotes',
      undefined,
      'quotes',
      'OLMAYAN_DEGER',
      DASHBOARDS,
      DATASETS,
      deps,
    );
    expect(result.path).toBeNull();
  });

  it('gecersiz tab adi reddedilir', async () => {
    const deps = buildDeps({ isCompanyAdmin: true });
    const result = await resolveNavigation(
      'inventory',
      undefined,
      'olmayan-tab',
      undefined,
      DASHBOARDS,
      DATASETS,
      deps,
    );
    expect(result.path).toBeNull();
  });

  it('envanter sayfasinda stockHistory tab path ini uretir', async () => {
    const deps = buildDeps({ isCompanyAdmin: true });
    const result = await resolveNavigation(
      'inventory',
      undefined,
      'stockHistory',
      undefined,
      DASHBOARDS,
      DATASETS,
      deps,
    );
    expect(result.path).toBe('/envanter?tab=stockHistory');
  });

  it('platform-admin intent listesinde hic yok', () => {
    expect(NAVIGATION_INTENTS).not.toContain('platform_admin');
  });

  it('katalogdaki her sayfa anahtari NAVIGATION_INTENTS icinde var', () => {
    for (const page of CHATBOT_PAGE_CATALOG) {
      expect(NAVIGATION_INTENTS).toContain(page.key);
    }
  });
});
