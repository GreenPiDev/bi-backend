import { HttpStatus } from '@nestjs/common';
import { AppException } from '../errors/app.exception';

/**
 * R2 anahtar sablonu `PILENS/{env}/{tenantId}/...` - ucuncu segment tenantId
 * (bkz. FilesController). Kullaniciya gosterilecek bir anahtar dogrudan client'tan
 * geri geldiginde (ornegin mesaj eki silme ucu) baska bir tenant'in anahtariyla
 * oynanmasini engellemek icin paylasilan dogrulama - varlik sizdirmamak icin
 * eslesmezse 403 degil 404 doner (CLAUDE.md §5).
 */
export function assertKeyBelongsToTenant(key: string, tenantId: string): void {
  const segments = key.split('/');
  if (segments[0] !== 'PILENS' || segments[2] !== tenantId) {
    throw new AppException(
      'NOT_FOUND',
      'Dosya bulunamadi.',
      HttpStatus.NOT_FOUND,
    );
  }
}
