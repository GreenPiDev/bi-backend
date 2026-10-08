import { Controller, HttpCode, Post } from '@nestjs/common';
import {
  CurrentUser,
  type RequestUser,
} from '../../core/decorators/current-user.decorator';
import { RequiresPermission } from '../../core/decorators/requires-permission.decorator';
import { AccountsCacheService } from '../accounts/accounts-cache.service';
import { CalendarEventsCacheService } from '../calendar-events/calendar-events-cache.service';
import { InteractionsCacheService } from '../interactions/interactions-cache.service';
import { MessagesCacheService } from '../messages/messages-cache.service';
import { OpportunitiesCacheService } from '../opportunities/opportunities-cache.service';
import { PostSaleCasesCacheService } from '../post-sale-cases/post-sale-cases-cache.service';
import { ProductsCacheService } from '../products/products-cache.service';
import { ProjectsCacheService } from '../projects/projects-cache.service';
import { PurchaseOrdersCacheService } from '../purchase-orders/purchase-orders-cache.service';
import { QuotesCacheService } from '../quotes/quotes-cache.service';
import { TenantProfileCacheService } from '../tenants/tenant-profile-cache.service';

/**
 * Ayarlar > Genel sekmesindeki "Önbellekleri Boşalt" butonu icin - normalde
 * her CRM modulunun kendi CRUD/import/interaction akislari kendi cache'ini
 * otomatik invalidate eder (bkz. ilgili *-cache.service.ts), ama dogrudan
 * DB'ye yazan elle mudahaleler (psql, seed script vb.) bu invalidation'i
 * atlar; TTL olmadigi icin bu durumda cache elle bosaltilana kadar bayat
 * kalir. Bu uc, o kacis yolu icin - TTL'siz liste cache'i olan tum
 * modulleri kapsar (accounts, opportunities, quotes, projects,
 * purchase-orders, post-sale-cases, interactions, messages, products,
 * calendar-events, tenant profili). products.invalidate() dusuk stok
 * listesini, calendarEvents.invalidate() bekleyen davetleri de kapsar
 * (bkz. ilgili cache servisindeki genisletilmis anahtar deseni).
 */
@Controller('cache')
export class CacheController {
  constructor(
    private readonly accountsCache: AccountsCacheService,
    private readonly opportunitiesCache: OpportunitiesCacheService,
    private readonly quotesCache: QuotesCacheService,
    private readonly projectsCache: ProjectsCacheService,
    private readonly purchaseOrdersCache: PurchaseOrdersCacheService,
    private readonly postSaleCasesCache: PostSaleCasesCacheService,
    private readonly interactionsCache: InteractionsCacheService,
    private readonly messagesCache: MessagesCacheService,
    private readonly productsCache: ProductsCacheService,
    private readonly calendarEventsCache: CalendarEventsCacheService,
    private readonly tenantProfileCache: TenantProfileCacheService,
  ) {}

  @Post('clear')
  @RequiresPermission('settings', 'UPDATE', 'general')
  @HttpCode(204)
  async clear(@CurrentUser() user: RequestUser): Promise<void> {
    await Promise.all([
      this.accountsCache.invalidate(),
      this.opportunitiesCache.invalidate(),
      this.quotesCache.invalidate(),
      this.projectsCache.invalidate(),
      this.purchaseOrdersCache.invalidate(),
      this.postSaleCasesCache.invalidate(),
      this.interactionsCache.invalidate(),
      this.messagesCache.invalidate(),
      this.productsCache.invalidate(),
      this.calendarEventsCache.invalidate(),
      this.tenantProfileCache.invalidate(user.tenantId),
    ]);
  }
}
