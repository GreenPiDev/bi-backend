import { Module } from '@nestjs/common';
import { PublicSharesController } from './public-shares.controller';
import { PublicSharesService } from './public-shares.service';
import { ShareThrottlerGuard } from './share-throttler.guard';
import { SharesService } from './shares.service';

/**
 * Merkezi paylasim linki altyapisi (bkz. docs/VARSAYIMLAR.md V87). Kaynaga ozgu
 * olusturma/listeleme/iptal uclari ilgili modulde yasar (yetki o kaynagin
 * pageKey'ine bagli kalsin diye) ve `SharesService`'i kullanir - ornek:
 * exports/quote-shares.controller.ts.
 */
@Module({
  controllers: [PublicSharesController],
  providers: [SharesService, PublicSharesService, ShareThrottlerGuard],
  exports: [SharesService],
})
export class SharesModule {}
