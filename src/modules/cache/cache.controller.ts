import { Controller, HttpCode, Post } from '@nestjs/common';
import { RequiresPermission } from '../../core/decorators/requires-permission.decorator';
import { AccountsCacheService } from '../accounts/accounts-cache.service';

/**
 * Ayarlar > Genel sekmesindeki "Önbellekleri Boşalt" butonu icin - normalde
 * Account CRUD/import/interaction akislari kendi cache'ini otomatik invalidate
 * eder (bkz. accounts-cache.service.ts), ama dogrudan DB'ye yazan elle mudahaleler
 * (psql, seed script vb.) bu invalidation'i atlar; TTL olmadigi icin bu durumda
 * cache elle bosaltilana kadar bayat kalir. Bu uc, o kacis yolu icin.
 */
@Controller('cache')
export class CacheController {
  constructor(private readonly accountsCache: AccountsCacheService) {}

  @Post('clear')
  @RequiresPermission('settings', 'UPDATE', 'general')
  @HttpCode(204)
  async clear(): Promise<void> {
    await this.accountsCache.invalidate();
  }
}
