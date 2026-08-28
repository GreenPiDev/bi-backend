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
 * `tabKey` hic verilmemisse (sayfa/nav duzeyinde kontrol - "bu sayfayi hic gorebilir mi")
 * o sayfada herhangi bir seviyede (sayfa geneli veya herhangi bir tab'a ozel) VIEW varsa
 * true doner. `tabKey` acikca verilmisse (bir sayfanin belirli bir tab'inin gorunurlugu
 * kontrol ediliyorsa) artik sayfa geneli (tabKey=null) izin otomatik eslesmez - sadece o
 * tab'a ozel kayit eslesir. Boylece "Sayfa Erisimleri" ekraninda bir sayfanin disi acik
 * ama ic tablarin hepsi kapali birakilabilir (sayfa gorunur, icinde hicbir tab render
 * edilmez) - bkz. docs/VARSAYIMLAR.md.
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
      (tabKey === undefined ? true : p.tabKey === tabKey),
  );
}
