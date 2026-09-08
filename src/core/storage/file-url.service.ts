import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Yuklenen dosyalarin (urun gorseli, avatar) URL'ini uretir. R2'nin genel "Public
 * Development URL"su (`r2.dev`) yerine backend'in kendi `/files` proxy ucuna isaret eder -
 * bkz. `modules/files/files.controller.ts` ve docs/VARSAYIMLAR.md V34.
 */
@Injectable()
export class FileUrlService {
  constructor(private readonly config: ConfigService) {}

  build(key: string | null, updatedAt: Date): string | null {
    if (!key) return null;
    const base = this.config
      .getOrThrow<string>('API_PUBLIC_URL')
      .replace(/\/+$/, '');
    return `${base}/files?key=${encodeURIComponent(key)}&v=${updatedAt.getTime()}`;
  }
}
