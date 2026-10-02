/**
 * Tenant basina subdomain (greenpi.pilens.com.tr, demo.pilens.com.tr...) destegi icin:
 * login istegindeki Origin header'indan tenant slug'ini cikarir. `www` ve kok domain
 * (`pilens.com.tr`) kisitlamadan muaftir (platform-admin/superadmin, henuz subdomain'i
 * olmayan tenant'lar ve yerel gelistirme icin). `TENANT_ROOT_DOMAIN` env'i tanimli
 * degilse (yerel/preview ortam) kisitlama hic uygulanmaz - bkz. docs/VARSAYIMLAR.md.
 */
const EXEMPT_LABELS = new Set(['www']);

export function extractTenantSlugFromOrigin(
  originHeader: string | undefined,
  rootDomain: string | undefined,
): string | null {
  if (!originHeader || !rootDomain) return null;
  let hostname: string;
  try {
    hostname = new URL(originHeader).hostname;
  } catch {
    return null;
  }
  if (hostname === rootDomain) return null;
  const suffix = `.${rootDomain}`;
  if (!hostname.endsWith(suffix)) return null;
  const label = hostname.slice(0, -suffix.length);
  if (!label || label.includes('.') || EXEMPT_LABELS.has(label)) return null;
  return label;
}
