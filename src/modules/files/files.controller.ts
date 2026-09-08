import { Controller, Get, HttpStatus, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  CurrentUser,
  type RequestUser,
} from '../../core/decorators/current-user.decorator';
import { AppException } from '../../core/errors/app.exception';
import { R2StorageService } from '../../core/storage/r2-storage.service';

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
    // Helmet'in varsayilan Cross-Origin-Resource-Policy: same-origin degeri, bu uc
    // kasitli olarak farkli origin'deki (frontend) bir <img> etiketine gomulecek
    // sekilde tasarlandigi icin gevsetiliyor - aksi halde tarayici (curl'in aksine)
    // gorseli sessizce reddeder (network sekmesinde 200 gorunur ama kirik resim ikonu
    // cikar).
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    file.body.pipe(res);
  }
}

/** Anahtar sablonu: PILENS/{env}/{tenantId}/... - ucuncu segment tenantId. */
function assertKeyBelongsToTenant(key: string, tenantId: string): void {
  const segments = key.split('/');
  if (segments[0] !== 'PILENS' || segments[2] !== tenantId) {
    throw new AppException(
      'NOT_FOUND',
      'Dosya bulunamadi.',
      HttpStatus.NOT_FOUND,
    );
  }
}
