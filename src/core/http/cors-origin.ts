/**
 * CORS_ORIGIN artik `*` iceren joker desenleri de destekler (orn.
 * `https://*.pilens.com.tr`), tenant basina subdomain (greenpi.pilens.com.tr,
 * demo.pilens.com.tr...) acilabilmesi icin - bkz. docs/VARSAYIMLAR.md.
 */
export function createCorsOriginChecker(
  originsEnv: string | undefined,
): (
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void,
) => void {
  const patterns = (originsEnv ?? 'http://localhost:5173')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  const matchers = patterns.map((pattern) => {
    if (!pattern.includes('*')) {
      return (origin: string) => origin === pattern;
    }
    const escaped = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '[^.]+');
    const regex = new RegExp(`^${escaped}$`);
    return (origin: string) => regex.test(origin);
  });

  return (origin, callback) => {
    if (!origin || matchers.some((matches) => matches(origin))) {
      callback(null, true);
      return;
    }
    callback(new Error('Not allowed by CORS'));
  };
}
