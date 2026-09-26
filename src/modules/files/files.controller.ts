import { Controller, Get, HttpStatus, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  CurrentUser,
  type RequestUser,
} from '../../core/decorators/current-user.decorator';
import { AppException } from '../../core/errors/app.exception';
import { R2StorageService } from '../../core/storage/r2-storage.service';
import { assertKeyBelongsToTenant } from '../../core/storage/tenant-scoped-key';

/**
 * Yuklenen dosyalari (urun gorseli, avatar) R2'den okuyup tarayiciya proxy'ler.
 * Cloudflare'in `r2.dev` genel URL'i SLA'siz/guvenilmez oldugu icin (bkz.
 * docs/VARSAYIMLAR.md V34) dosyalar artik hic public olarak servis edilmiyor - bu uc,
 * JwtAuthGuard'in zaten sagladigi kimlik dogrulamanin ustune, anahtarin ikinci path
 * segmentinin (tenantId) istegi yapan kullanicinin tenant'iyla eslesmesini de zorunlu
 * kilar; eslesmezse (varlik sizdirmamak icin 403 degil) 404 doner (CLAUDE.md §5).
 */
@Controller('files')
export class FilesController {
  constructor(private readonly storage: R2StorageService) {}

  @Get()
  async getFile(
    @Query('key') key: string | undefined,
    @Query('name') name: string | undefined,
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ): Promise<void> {
    if (!key) {
      throw new AppException(
        'FILE_REQUIRED',
        'Dosya anahtari belirtilmedi.',
        HttpStatus.BAD_REQUEST,
      );
    }
    assertKeyBelongsToTenant(key, user.tenantId);

    let file;
    try {
      file = await this.storage.download(key);
    } catch (error) {
      if (error instanceof AppException) throw error;
      throw new AppException(
        'NOT_FOUND',
        'Dosya bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }

    res.setHeader(
      'Content-Type',
      file.contentType ?? 'application/octet-stream',
    );
    if (file.contentLength !== undefined) {
      res.setHeader('Content-Length', String(file.contentLength));
    }
    res.setHeader('Cache-Control', 'private, max-age=3600');
    // `name` verilirse (mesaj eki gibi orijinal adi olan dosyalar) tarayici "farkli
    // kaydet" veya otomatik indirmede bu adi kullanir - aksi halde URL'deki
    // "/files" yol parcasindan turetilen jenerik bir ad gorunur. CRLF/quote'lar
    // header enjeksiyonuna karsi temizlenir; ASCII-disi karakterler icin RFC 5987
    // filename* de eklenir (Turkce karakterli dosya adlari icin).
    if (name) {
      const sanitized = name.replace(/[\r\n"]/g, '');
      const asciiFallback = sanitized.replace(/[^\x20-\x7E]/g, '_');
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(sanitized)}`,
      );
    }
    // Helmet'in varsayilan Cross-Origin-Resource-Policy: same-origin degeri, bu uc
    // kasitli olarak farkli origin'deki (frontend) bir <img> etiketine gomulecek
    // sekilde tasarlandigi icin gevsetiliyor - aksi halde tarayici (curl'in aksine)
    // gorseli sessizce reddeder (network sekmesinde 200 gorunur ama kirik resim ikonu
    // cikar).
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    file.body.pipe(res);
  }
}
