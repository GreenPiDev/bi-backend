/** Sifre sifirlama baglantisinin gecerlilik suresi. */
export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

/** Sifre degisince eski access token'lari reddetmek icin Redis'te tutulan isaretin
 * omru - access token omrunden (15 dk) biraz uzun olmali. */
export const PASSWORD_CHANGED_MARKER_TTL_SECONDS = 20 * 60;

export function passwordChangedMarkerKey(userId: string): string {
  return `auth:pwchanged:${userId}`;
}

/** JWT `iat` saniye cinsindendir; `passwordChangedAt`'tan once (saniye hassasiyetiyle)
 * cikarilmis token'lar gecersizdir. Ayni saniyede cikarilanlar gecerli sayilir ki
 * sifirlamanin hemen ardindan yapilan login reddedilmesin. */
export function isIssuedBeforePasswordChange(
  iatSeconds: number | undefined,
  passwordChangedAtMs: number,
): boolean {
  if (iatSeconds === undefined) return false;
  return iatSeconds < Math.floor(passwordChangedAtMs / 1000);
}
