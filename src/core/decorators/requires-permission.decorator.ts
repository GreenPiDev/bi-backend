import { SetMetadata } from '@nestjs/common';
import type { PermissionAction } from '@prisma/client';

export interface RequiredPermission {
  pageKey: string;
  action: PermissionAction;
  tabKey?: string;
}

export const PERMISSION_KEY = 'requiresPermission';

/**
 * Ucun calisabilmesi icin kullanicinin (coklu) rolunden en az birinde `pageKey`
 * (+ opsiyonel `tabKey`) uzerinde `action` izni olmasi gerektigini belirtir.
 * `pageKey`, core/modules/page-registry.ts'teki PAGE_REGISTRY'ye karsi PermissionGuard
 * tarafindan whitelist dogrulanir. Rol isimleri (COMPANYADMIN haric) burada asla gecmez -
 * bkz. CLAUDE.md SS0/SS16.
 */
export const RequiresPermission = (
  pageKey: string,
  action: PermissionAction,
  tabKey?: string,
) =>
  SetMetadata(PERMISSION_KEY, {
    pageKey,
    action,
    tabKey,
  } satisfies RequiredPermission);
