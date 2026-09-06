import { SetMetadata } from '@nestjs/common';

export const MODULE_PAGE_KEY = 'modulePageKey';

/**
 * Ucun hangi PAGE_REGISTRY sayfasina ait oldugunu belirtir - ModuleGuard bunu
 * (veya @RequiresPermission'in pageKey'ini) core/modules/page-modules.service.ts'teki
 * DB-tabanli PageModuleAssignment eslemesine karsi cozumleyip modul kontrolu yapar.
 * `@RequiresModule(...)` (requires-module.decorator.ts) ile birlikte KULLANILMAZ - o,
 * sabit/legacy modul kontrolu icindir (bkz. ModuleGuard).
 */
export const ModulePage = (pageKey: string) =>
  SetMetadata(MODULE_PAGE_KEY, pageKey);
