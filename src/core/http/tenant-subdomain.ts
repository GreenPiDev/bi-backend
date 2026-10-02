/**
 * Tenant basina subdomain (greenpi.pilens.com.tr, demo.pilens.com.tr...) destegi icin:
 * login istegindeki Origin header'ini siniflandirir.
 * - 'tenant': gercek bir tenant subdomain'i, login o tenant'in kullanicisiyla sinirlanir.
 * - 'root': kok domain veya `www` (orn. www.pilens.com.tr) - sadece superadmin
 *   (isPlatformAdmin) buradan giris yapabilir, sirket kullanicilari kendi subdomain'ini
 *   kullanmak zorunda.
 * - 'unrestricted': pilens disi origin (Vercel preview, localhost...) veya
 *   `TENANT_ROOT_DOMAIN` tanimsiz (yerel gelistirme) - hic kisitlama uygulanmaz.
 * bkz. docs/VARSAYIMLAR.md.
 */
export type LoginOriginClassification =
  | { kind: 'tenant'; slug: string }
  | { kind: 'root' }
  | { kind: 'unrestricted' };

export function classifyLoginOrigin(
  originHeader: string | undefined,
  rootDomain: string | undefined,
): LoginOriginClassification {
  if (!originHeader || !rootDomain) return { kind: 'unrestricted' };
  let hostname: string;
  try {
    hostname = new URL(originHeader).hostname;
  } catch {
    return { kind: 'unrestricted' };
  }
  if (hostname === rootDomain) return { kind: 'root' };
  const suffix = `.${rootDomain}`;
  if (!hostname.endsWith(suffix)) return { kind: 'unrestricted' };
  const label = hostname.slice(0, -suffix.length);
  if (!label || label.includes('.')) return { kind: 'unrestricted' };
  if (label === 'www') return { kind: 'root' };
  return { kind: 'tenant', slug: label };
}
