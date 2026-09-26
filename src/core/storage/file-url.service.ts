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

  /** `fileName` verilirse (mesaj eki gibi orijinal adi olan dosyalar icin)
   * indirilen dosyanin adi bu olur - bkz. FilesController Content-Disposition. */
  build(key: string | null, updatedAt: Date, fileName?: string): string | null {
    if (!key) return null;
    const base = this.config
      .getOrThrow<string>('API_PUBLIC_URL')
      .replace(/\/+$/, '');
    const nameParam = fileName ? `&name=${encodeURIComponent(fileName)}` : '';
    return `${base}/files?key=${encodeURIComponent(key)}&v=${updatedAt.getTime()}${nameParam}`;
  }
}
