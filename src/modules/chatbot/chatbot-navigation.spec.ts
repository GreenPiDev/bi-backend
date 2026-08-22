import { describe, expect, it } from 'vitest';
import { NAVIGATION_INTENTS, resolveNavigation } from './chatbot-navigation';

const DASHBOARDS = [
  { id: 'd1', name: 'Satış Panosu' },
  { id: 'd2', name: 'Stok Panosu' },
];
const DATASETS = [{ id: 's1', name: 'Perakende Satış' }];

describe('resolveNavigation', () => {
  it('VIEWER icin ayarlar sayfasina izin vermez', () => {
    const result = resolveNavigation(
      'settings',
      undefined,
      'VIEWER',
      DASHBOARDS,
      DATASETS,
    );
    expect(result.path).toBeNull();
  });

  it('OWNER icin ayarlar sayfasina izin verir', () => {
    const result = resolveNavigation(
      'settings',
      undefined,
      'OWNER',
      DASHBOARDS,
      DATASETS,
    );
    expect(result.path).toBe('/settings');
  });

  it('ADMIN icin ayarlar sayfasina izin verir', () => {
    const result = resolveNavigation(
      'settings',
      undefined,
      'ADMIN',
      DASHBOARDS,
      DATASETS,
    );
    expect(result.path).toBe('/settings');
  });

  it('bilinmeyen pano adinda null doner', () => {
    const result = resolveNavigation(
      'dashboard_view',
      'olmayan pano',
      'EDITOR',
      DASHBOARDS,
      DATASETS,
    );
    expect(result.path).toBeNull();
  });

  it('kismi/kucuk-buyuk harf duyarsiz isim eslesmesiyle dogru pano pathini doner', () => {
    const result = resolveNavigation(
      'dashboard_view',
      'satış',
      'VIEWER',
      DASHBOARDS,
      DATASETS,
    );
    expect(result.path).toBe('/dashboards/d1');
  });

  it('dataset_view dogru veri kumesi path ini doner', () => {
    const result = resolveNavigation(
      'dataset_view',
      'Perakende',
      'VIEWER',
      DASHBOARDS,
      DATASETS,
    );
    expect(result.path).toBe('/datasets/s1');
  });

  it('rol kisiti olmayan intent lerde her rol icin calisir', () => {
    for (const intent of [
      'dashboards_list',
      'datasets_list',
      'profile',
    ] as const) {
      const result = resolveNavigation(
        intent,
        undefined,
        'VIEWER',
        DASHBOARDS,
        DATASETS,
      );
      expect(result.path).not.toBeNull();
    }
  });

  it('platform-admin intent listesinde hic yok', () => {
    expect(NAVIGATION_INTENTS).not.toContain('platform_admin');
  });
});
