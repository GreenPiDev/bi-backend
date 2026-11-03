import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Backend surum kimligi. Ayni imajdan calisan tum instance'lar AYNI degeri doner:
 * Dockerfile build sirasinda kod icerigi hash'ini BUILD_ID dosyasina yazar.
 * Oncelik: APP_VERSION env > BUILD_ID dosyasi > 'dev' (yerel gelistirme, banner tetiklemez).
 */
export function resolveAppVersion(
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): string {
  if (env.APP_VERSION) return env.APP_VERSION;
  try {
    const fromFile = readFileSync(join(cwd, 'BUILD_ID'), 'utf8').trim();
    if (fromFile) return fromFile;
  } catch {
    // dosya yok: yerel gelistirme
  }
  return 'dev';
}
