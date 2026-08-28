import type { PermissionAction } from '@prisma/client';

export interface EffectivePermission {
  pageKey: string;
  tabKey: string | null;
  action: PermissionAction;
}

export interface EffectivePermissionSet {
  /** true ise kullanicinin rollerinden biri COMPANYADMIN'dir - Page Registry'deki
   * TUM sayfa/aksiyonlara (gelecekte eklenecekler dahil) yetkilidir, `permissions`
   * listesi bu durumda bos olabilir (bkz. migrate-roles.ts, Role.isCompanyAdmin). */
  isCompanyAdmin: boolean;
  permissions: EffectivePermission[];
}

/**
 * `tabKey` verilmemisse (sayfa geneli) hem tabsiz hem tabli izinler eslesir - bir role
 * sayfanin tamamina VIEW verildiyse, o sayfanin herhangi bir tab'ina da otomatik VIEW
 * verilmis sayilir. `tabKey` verilmisse, ya o tab'a ozel bir izin ya da sayfa geneli
 * (tabKey=null) bir izin olmasi yeterlidir.
 */
export function hasPermission(
  set: EffectivePermissionSet,
  pageKey: string,
  action: PermissionAction,
  tabKey?: string,
): boolean {
  if (set.isCompanyAdmin) return true;
  return set.permissions.some(
    (p) =>
      p.pageKey === pageKey &&
      p.action === action &&
      (p.tabKey === null || p.tabKey === undefined || p.tabKey === tabKey),
  );
}
