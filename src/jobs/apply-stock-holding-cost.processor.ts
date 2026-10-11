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
 * Urun bazinda StockMovement YAZILMAZ (ad-hoc karar, bkz. CLAUDE.md) - stoklu
 * urun sayisi buyuk tenant'larda her gece her urun icin bir satir acmak
 * crm_stock_movements/stockHistory ekranini sissirip asil mal kabul/satis/
 * transfer hareketlerini gorsel olarak gomerdi. Bunun yerine tenant basina
 * TEK bir StockHoldingCostLog ozet satiri yazilir (etkilenen urun sayisi +
 * toplam maliyet artisinin TL karsiligi).
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

    let productCount = 0;
    let totalCostDelta = new Prisma.Decimal(0);

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

      await this.prisma.product.update({
        where: { id: product.id },
        data: { avgCost: newAvgCost },
      });

      productCount += 1;
      totalCostDelta = totalCostDelta.add(
        newAvgCost.sub(previousAvgCost).mul(totalQty),
      );
    }

    if (productCount > 0) {
      await this.prisma.stockHoldingCostLog.create({
        data: {
          tenantId,
          monthlyRatePct: new Prisma.Decimal(monthlyRatePct),
          productCount,
          totalCostDelta: totalCostDelta.toDecimalPlaces(
            2,
            Prisma.Decimal.ROUND_HALF_UP,
          ),
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
