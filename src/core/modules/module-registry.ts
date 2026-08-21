export interface ModuleDefinition {
  key: string;
  label: string;
  /** true ise her tenant icin daima acik kabul edilir, TenantModule tablosuna hic yazilmaz. */
  alwaysOn: boolean;
}

/**
 * Satilabilir tum modullerin tek kaynagi. Yeni bir sektorel modul eklerken
 * yapilmasi gereken tek sey buraya bir satir eklemek.
 */
export const MODULE_REGISTRY: readonly ModuleDefinition[] = [
  { key: 'core', label: 'Cekirdek', alwaysOn: true },
];

export function findModuleDefinition(
  key: string,
): ModuleDefinition | undefined {
  return MODULE_REGISTRY.find((module) => module.key === key);
}

export function isKnownModuleKey(key: string): boolean {
  return findModuleDefinition(key) !== undefined;
}
