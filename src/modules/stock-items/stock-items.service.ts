import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Product, StockItem } from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import { type PagedResult } from '../../core/dto/list-query.dto';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { AuditService } from '../audit/audit.service';
import type {
  StockHistoryQueryDto,
  StockItemQueryDto,
  UpsertStockItemDto,
} from './dto/stock-item.dto';

export type StockItemWithProduct = Pick<
  StockItem,
  'id' | 'productId' | 'quantity' | 'createdAt' | 'updatedAt'
> & { product: Product };

export interface StockMovementView {
  id: string;
  productId: string;
  productName: string;
  userName: string;
  userEmail: string;
  note: string | null;
  previousQuantity: number;
  quantity: number;
  delta: number;
  createdAt: Date;
}

/** Henuz hic miktar girilmemis (StockItem kaydi olmayan) urunler icin de bir
 * satir uretmek amaciyla kullanilan sentetik id - StockItemsController hicbir
 * yerde bu id'yi PK olarak yazmaya calismaz, PATCH /stock-items/:productId
 * her zaman productId ile calisir. */
function virtualId(productId: string): string {
  return `virtual:${productId}`;
}

@Injectable()
export class StockItemsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly audit: AuditService,
  ) {}

  /**
   * /urunler'de tanimli her urun /stok'ta bir satir olarak gorunur - miktar
   * hic girilmemisse StockItem kaydi henuz yok demektir, bu durumda 0 miktarli
   * "sanal" bir satir uretilir (PATCH ile ilk kez kaydedildiginde gercek satira
   * doner). Aksi halde kullanici yeni bir urune stok girecek bir satir/buton
   * hic goremiyordu (bkz. bug raporu).
   */
  private async resolveRows(q?: string): Promise<StockItemWithProduct[]> {
    const products = await this.prisma.product.findMany({
      where: q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' as const } },
              { sku: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : undefined,
      orderBy: { name: 'asc' },
      include: { stockItems: true },
    });

    return products.map((product) => {
      const { stockItems, ...productFields } = product;
      const existing = stockItems[0];
      if (existing) {
        return { ...existing, product: productFields as Product };
      }
      return {
        id: virtualId(product.id),
        productId: product.id,
        quantity: new Prisma.Decimal(0),
        createdAt: product.createdAt,
        updatedAt: product.createdAt,
        product: productFields as Product,
      };
    });
  }

  async list(
    query: StockItemQueryDto,
  ): Promise<PagedResult<StockItemWithProduct>> {
    const { page, pageSize, q } = query;
    const rows = await this.resolveRows(q);
    const total = rows.length;
    const data = rows.slice((page - 1) * pageSize, page * pageSize);

    return {
      data,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  /**
   * ST1: Product.minStockLevel tanimli VE (kayitli ya da hic girilmemis, yani
   * 0 varsayilan) miktar bu esige esit ya da altindaysa dusuk stok sayilir.
   */
  async listLowStock(): Promise<StockItemWithProduct[]> {
    const rows = await this.resolveRows();
    return rows.filter((row) => {
      const minStockLevel = row.product.minStockLevel;
      if (minStockLevel === null || minStockLevel === undefined) {
        return false;
      }
      return Number(row.quantity) <= minStockLevel;
    });
  }

  /**
   * Pragmatik ek uc (SP/ST kabul kriterlerinin literal bir parcasi degil): urun
   * basina stok miktarini elle setlemek icin minimal bir giris noktasi.
   * tenant-scoped extension upsert desteklemedigi icin (bkz. QuotesService.
   * ensurePostSaleCase) findFirst + create/update deseni kullanilir.
   */
  async upsertByProductId(
    productId: string,
    dto: UpsertStockItemDto,
  ): Promise<StockItemWithProduct> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId },
    });
    if (!product) {
      throw new AppException(
        'NOT_FOUND',
        'Urun bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }

    const existing = await this.prisma.stockItem.findFirst({
      where: { productId },
    });

    const stockItem = existing
      ? await this.prisma.stockItem.update({
          where: { id: existing.id },
          data: { quantity: dto.quantity },
        })
      : await this.prisma.stockItem.create({
          data: { productId, quantity: dto.quantity } as never,
        });

    await this.audit.log({
      action: existing ? 'UPDATE' : 'CREATE',
      entity: 'StockItem',
      entityId: stockItem.id,
      meta: existing
        ? {
            productId,
            productName: product.name,
            previousQuantity: existing.quantity,
            quantity: dto.quantity,
            note: dto.note ?? null,
          }
        : {
            productId,
            productName: product.name,
            quantity: dto.quantity,
            note: dto.note ?? null,
          },
    });

    return { ...stockItem, product };
  }

  /** Stok Gecmisi (/envanter?tab=stockHistory): AuditService'in genel denetim
   * kaydini StockItem entity'sine gore filtreleyip tabloya uygun sekle cevirir. */
  async listHistory(query: StockHistoryQueryDto): Promise<StockMovementView[]> {
    const logs = await this.audit.list('StockItem', {
      userId: query.userId,
      meta: query.productId ? { productId: query.productId } : undefined,
    });
    return logs.map((log) => {
      const meta = (log.meta ?? {}) as Record<string, unknown>;
      const quantity = Number(meta.quantity ?? 0);
      const previousQuantity = Number(meta.previousQuantity ?? 0);
      return {
        id: log.id,
        productId: String(meta.productId ?? ''),
        productName: String(meta.productName ?? '—'),
        userName: log.userName,
        userEmail: log.userEmail,
        note:
          typeof meta.note === 'string' && meta.note.length > 0
            ? meta.note
            : null,
        previousQuantity,
        quantity,
        delta: quantity - previousQuantity,
        createdAt: log.createdAt,
      };
    });
  }
}
