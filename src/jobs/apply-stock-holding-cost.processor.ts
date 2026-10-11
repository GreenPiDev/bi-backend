import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../core/prisma/prisma.service';
import { TenantContext } from '../core/tenant/tenant-context';
import { ProductsCacheService } from '../modules/products/products-cache.service';
import { applyDailyHoldingCost } from '../modules/stock-items/stock-holding-cost.util';
import {
  DEFAULT_STOCK_HOLDING_COST,
  STOCK_HOLDING_COST_KEY,
  type StockHoldingCostSetting,
} from '../modules/tenant-settings/tenant-settings.constants';
import {
  STOCK_HOLDING_COST_QUEUE,
  STOCK_HOLDING_COST_SYSTEM_ACTOR_ID,
} from './stock-holding-cost-queue.constants';

/**
 * Opsiyonel "Stok Bekletme Maliyeti" (bkz. /settings?tab=general, ad-hoc) -
 * her gun 00:30'da (Europe/Istanbul, bkz. StockHoldingCostSchedulerBootstrap)
 * calisir. Etkin ve orani > 0 olan her tenant'ta, stogu (toplam miktari > 0)
 * olan her urunun avgCost'una bir gunluk bilesik artis uygular. Maliyeti
 * null/0 olan urunler atlanir (0 uzerinde bilesik artis anlamsiz).
 *
 * StockMovement urun bazinda tek bir "temsili" depoya (o urunun en cok
 * stogunun oldugu depo) yazilir - quantity=0 (miktar degismez),
 * previousQuantity/newQuantity urunun TUM depolardaki toplam miktaridir
 * (maliyet depo bazinda degil urun bazinda tutuldugu icin, bkz.
 * docs/VARSAYIMLAR.md).
 */
@Processor(STOCK_HOLDING_COST_QUEUE)
export class ApplyStockHoldingCostProcessor extends WorkerHost {
  private readonly logger = new Logger(ApplyStockHoldingCostProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly productsCache: ProductsCacheService,
  ) {
    super();
  }

  async process(): Promise<void> {
    const settings = await this.prisma.tenantSetting.findMany({
      where: { key: STOCK_HOLDING_COST_KEY },
    });

    for (const setting of settings) {
      const value = (setting.value ??
        DEFAULT_STOCK_HOLDING_COST) as unknown as StockHoldingCostSetting;
      if (!value.enabled || !(value.monthlyRatePct > 0)) {
        continue;
      }
      try {
        await this.applyForTenant(setting.tenantId, value.monthlyRatePct);
      } catch (err) {
        this.logger.warn(
          `Tenant ${setting.tenantId} icin stok bekletme maliyeti uygulanamadi: ${(err as Error).message}`,
        );
      }
    }
  }

  private async applyForTenant(
    tenantId: string,
    monthlyRatePct: number,
  ): Promise<void> {
    const products = await this.prisma.product.findMany({
      where: { tenantId, deletedAt: null },
      include: { stockItems: true },
    });

    for (const product of products) {
      const totalQty = product.stockItems.reduce(
        (sum, si) => sum.add(si.quantity),
        new Prisma.Decimal(0),
      );
      if (!totalQty.gt(0)) {
        continue;
      }
      const previousAvgCost = product.avgCost;
      if (!previousAvgCost || !previousAvgCost.gt(0)) {
        continue;
      }

      const newAvgCost = applyDailyHoldingCost(
        previousAvgCost,
        monthlyRatePct,
      ).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);

      const representativeWarehouseId = [...product.stockItems].sort(
        (a, b) =>
          b.quantity.comparedTo(a.quantity) ||
          a.warehouseId.localeCompare(b.warehouseId),
      )[0].warehouseId;

      await this.prisma.product.update({
        where: { id: product.id },
        data: { avgCost: newAvgCost },
      });
      await this.prisma.stockMovement.create({
        data: {
          tenantId,
          productId: product.id,
          warehouseId: representativeWarehouseId,
          type: 'HOLDING_COST',
          quantity: new Prisma.Decimal(0),
          unitCost: null,
          previousAvgCost,
          newAvgCost,
          previousQuantity: totalQty,
          newQuantity: totalQty,
          note: `Günlük stok bekletme maliyeti artışı (aylık %${monthlyRatePct}).`,
          createdById: STOCK_HOLDING_COST_SYSTEM_ACTOR_ID,
        },
      });
    }

    await TenantContext.run(
      { tenantId, userId: STOCK_HOLDING_COST_SYSTEM_ACTOR_ID, roleIds: [] },
      () => this.productsCache.invalidate(),
    );
  }
}
