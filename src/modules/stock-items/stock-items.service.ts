import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Product, StockItem } from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import { parseSort, type PagedResult } from '../../core/dto/list-query.dto';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { AuditService } from '../audit/audit.service';
import { ProductsCacheService } from '../products/products-cache.service';
import type {
  StockHistoryQueryDto,
  StockItemQueryDto,
  TransferStockDto,
  UpsertStockItemDto,
} from './dto/stock-item.dto';
import { getStockStatus, STOCK_STATUS_SORT_ORDER } from './stock-status.util';

/** Depo bazinda miktar - bir urunun hangi depoda kac tane oldugunu gosteren
 * aciklatilmis satir (/envanter?tab=stock'taki genisletilmis satirin icerigi). */
export interface StockItemWarehouseBreakdown {
  warehouseId: string;
  warehouseName: string;
  quantity: Prisma.Decimal;
}

export type StockItemWithProduct = Pick<
  StockItem,
  'id' | 'productId' | 'createdAt' | 'updatedAt'
> & {
  /** Depolar toplami - "sanal" satirlarda (bkz. asagisi) 0'dir. */
  quantity: Prisma.Decimal;
  product: Product;
  /** Sadece gercek StockItem kaydi olan depoleri icerir, isme gore siralidir. */
  warehouses: StockItemWarehouseBreakdown[];
};

export interface StockMovementView {
  id: string;
  productId: string;
  productName: string;
  warehouseId: string;
  warehouseName: string;
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
 * her zaman productId + warehouseId ile calisir. */
function virtualId(productId: string): string {
  return `virtual:${productId}`;
}

type ProductWithStockItems = Product & {
  stockItems: (StockItem & { warehouse: { id: string; name: string } })[];
};

/** Tek bir urun satirina, depolar arasi toplam miktar + depo kirilimini ekler. */
function toStockItemWithProduct(
  product: ProductWithStockItems,
): StockItemWithProduct {
  const { stockItems, ...productFields } = product;
  const warehouses: StockItemWarehouseBreakdown[] = stockItems
    .map((si) => ({
      warehouseId: si.warehouseId,
      warehouseName: si.warehouse.name,
      quantity: si.quantity,
    }))
    .sort((a, b) => a.warehouseName.localeCompare(b.warehouseName, 'tr'));
  const quantity = stockItems.reduce(
    (sum, si) => sum.add(si.quantity),
    new Prisma.Decimal(0),
  );
  const first = stockItems[0];
  return first
    ? {
        id: first.id,
        productId: product.id,
        quantity,
        createdAt: first.createdAt,
        updatedAt: first.updatedAt,
        product: productFields as Product,
        warehouses,
      }
    : {
        id: virtualId(product.id),
        productId: product.id,
        quantity,
        createdAt: product.createdAt,
        updatedAt: product.createdAt,
        product: productFields as Product,
        warehouses,
      };
}

/** Siralama tum sonuc kumesi uzerinde (sayfalamadan once) uygulanir - /kisiler gibi
 * diger liste sayfalarinin server-side sort deseniyle ayni, aksi halde "Urun" kolonuna
 * tiklamak sadece o anki sayfanin satirlarini yeniden siralar (bkz. kullanici bulgusu).
 * `name` disinda bir alan (veya hic sort) verilirse varsayilan renk/durum sirasina
 * duser - Array.sort'un stabil olmasi sayesinde esit durumdaki satirlar aralarinda
 * zaten DB'den gelen isim sirasini korur. */
function sortRows(
  rows: StockItemWithProduct[],
  sort: string | undefined,
): StockItemWithProduct[] {
  const parsed = parseSort(sort, ['name'], {
    field: 'status',
    direction: 'asc',
  });
  if (parsed.field === 'name') {
    const dir = parsed.direction === 'asc' ? 1 : -1;
    return [...rows].sort(
      (a, b) => dir * a.product.name.localeCompare(b.product.name, 'tr'),
    );
  }
  return [...rows].sort(
    (a, b) =>
      STOCK_STATUS_SORT_ORDER[
        getStockStatus(a.quantity, a.product.minStockLevel)
      ] -
      STOCK_STATUS_SORT_ORDER[
        getStockStatus(b.quantity, b.product.minStockLevel)
      ],
  );
}

@Injectable()
export class StockItemsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly audit: AuditService,
    private readonly productsCache: ProductsCacheService,
  ) {}

  /**
   * /urunler'de tanimli her urun /stok'ta bir satir olarak gorunur - toplam miktar
   * hic girilmemisse (hicbir depoda StockItem kaydi yoksa) 0 miktarli "sanal" bir
   * satir uretilir (PATCH ile ilk kez kaydedildiginde gercek satira doner). Aksi
   * halde kullanici yeni bir urune stok girecek bir satir/buton hic goremiyordu
   * (bkz. bug raporu). Gercek depolari olan urunler icin toplam, depolar arasi
   * StockItem.quantity toplamidir (bkz. toStockItemWithProduct).
   */
  private async resolveRows(filters?: {
    q?: string;
    productListId?: string;
    brand?: string;
    category?: string;
  }): Promise<StockItemWithProduct[]> {
    const { q, productListId, brand, category } = filters ?? {};
    const products = await this.prisma.product.findMany({
      where: {
        ...(productListId ? { productListId } : {}),
        ...(brand ? { brand } : {}),
        ...(category ? { category } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' as const } },
                { sku: { contains: q, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      orderBy: { name: 'asc' },
      include: { stockItems: { include: { warehouse: true } } },
    });

    return products.map((product) =>
      toStockItemWithProduct(product as ProductWithStockItems),
    );
  }

  async list(
    query: StockItemQueryDto,
  ): Promise<PagedResult<StockItemWithProduct>> {
    const {
      page,
      pageSize,
      q,
      productListId,
      brand,
      category,
      stockStatus,
      sort,
    } = query;
    const rows = await this.resolveRows({ q, productListId, brand, category });
    const filteredRows = stockStatus
      ? rows.filter(
          (row) =>
            getStockStatus(row.quantity, row.product.minStockLevel) ===
            stockStatus,
        )
      : rows;
    const sortedRows = sortRows(filteredRows, sort);
    const total = sortedRows.length;
    const data = sortedRows.slice((page - 1) * pageSize, page * pageSize);

    return {
      data,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  /**
   * ST1: Product.minStockLevel tanimli VE (depolar arasi toplam miktar, hic
   * girilmemisse 0 varsayilan) bu esige esit ya da altindaysa dusuk stok sayilir.
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

  private async requireProduct(productId: string): Promise<Product> {
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
    return product;
  }

  private async requireWarehouse(
    warehouseId: string,
  ): Promise<{ id: string; name: string }> {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: warehouseId },
    });
    if (!warehouse) {
      throw new AppException(
        'NOT_FOUND',
        'Depo bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    return warehouse;
  }

  /** `upsertByProductId` ve `transferStock` arasinda paylasilan cekirdek:
   * urun + depo basina miktari setler ve bunu denetim kaydina yazar.
   * tenant-scoped extension upsert desteklemedigi icin (bkz. QuotesService.
   * ensurePostSaleCase) findFirst + create/update deseni kullanilir. */
  private async setWarehouseQuantity(params: {
    productId: string;
    productName: string;
    warehouseId: string;
    warehouseName: string;
    quantity: number;
    note?: string | null;
  }): Promise<StockItem> {
    const existing = await this.prisma.stockItem.findFirst({
      where: { productId: params.productId, warehouseId: params.warehouseId },
    });

    const stockItem = existing
      ? await this.prisma.stockItem.update({
          where: { id: existing.id },
          data: { quantity: params.quantity },
        })
      : await this.prisma.stockItem.create({
          data: {
            productId: params.productId,
            warehouseId: params.warehouseId,
            quantity: params.quantity,
          } as never,
        });

    await this.audit.log({
      action: existing ? 'UPDATE' : 'CREATE',
      entity: 'StockItem',
      entityId: stockItem.id,
      meta: {
        productId: params.productId,
        productName: params.productName,
        warehouseId: params.warehouseId,
        warehouseName: params.warehouseName,
        ...(existing ? { previousQuantity: existing.quantity } : {}),
        quantity: params.quantity,
        note: params.note ?? null,
      },
    });

    return stockItem;
  }

  private async refreshRow(productId: string): Promise<StockItemWithProduct> {
    const refreshedProduct = await this.prisma.product.findFirst({
      where: { id: productId },
      include: { stockItems: { include: { warehouse: true } } },
    });
    if (!refreshedProduct) {
      // Teorik olarak ulasilmaz: ust satirda ayni productId icin kayit garanti.
      throw new AppException(
        'NOT_FOUND',
        'Urun bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    return toStockItemWithProduct(refreshedProduct as ProductWithStockItems);
  }

  /**
   * Pragmatik ek uc (SP/ST kabul kriterlerinin literal bir parcasi degil): urun +
   * depo basina stok miktarini elle setlemek icin minimal bir giris noktasi.
   */
  async upsertByProductId(
    productId: string,
    dto: UpsertStockItemDto,
  ): Promise<StockItemWithProduct> {
    const product = await this.requireProduct(productId);
    const warehouse = await this.requireWarehouse(dto.warehouseId);

    await this.setWarehouseQuantity({
      productId,
      productName: product.name,
      warehouseId: warehouse.id,
      warehouseName: warehouse.name,
      quantity: dto.quantity,
      note: dto.note,
    });

    await this.productsCache.invalidate();
    return this.refreshRow(productId);
  }

  /** Ad-hoc (bkz. CLAUDE.md): bir urunun stogunu bir depodan diger bir depoya
   * tasir. Iki ayri StockItem satirini guncelleyip her biri icin ayri bir
   * denetim kaydi uretir (bkz. setWarehouseQuantity) - boylece Stok Gecmisi
   * ekrani ozel bir "transfer" turu bilmeden, iki normal hareket olarak
   * gosterir (kaynakta eksi, hedefte arti delta). */
  async transferStock(
    productId: string,
    dto: TransferStockDto,
  ): Promise<StockItemWithProduct> {
    const product = await this.requireProduct(productId);
    const fromWarehouse = await this.requireWarehouse(dto.fromWarehouseId);
    const toWarehouse = await this.requireWarehouse(dto.toWarehouseId);

    const fromStockItem = await this.prisma.stockItem.findFirst({
      where: { productId, warehouseId: dto.fromWarehouseId },
    });
    const fromQuantity = Number(fromStockItem?.quantity ?? 0);
    if (dto.quantity > fromQuantity) {
      throw new AppException(
        'INSUFFICIENT_STOCK',
        `Kaynak depoda yeterli stok yok (mevcut: ${fromQuantity}).`,
        HttpStatus.BAD_REQUEST,
        { available: fromQuantity },
      );
    }

    const toStockItem = await this.prisma.stockItem.findFirst({
      where: { productId, warehouseId: dto.toWarehouseId },
    });
    const toQuantity = Number(toStockItem?.quantity ?? 0);

    const note = dto.note?.trim() || undefined;

    await this.setWarehouseQuantity({
      productId,
      productName: product.name,
      warehouseId: fromWarehouse.id,
      warehouseName: fromWarehouse.name,
      quantity: fromQuantity - dto.quantity,
      note: note ?? `${toWarehouse.name} deposuna tasindi.`,
    });
    await this.setWarehouseQuantity({
      productId,
      productName: product.name,
      warehouseId: toWarehouse.id,
      warehouseName: toWarehouse.name,
      quantity: toQuantity + dto.quantity,
      note: note ?? `${fromWarehouse.name} deposundan tasindi.`,
    });

    await this.productsCache.invalidate();
    return this.refreshRow(productId);
  }

  /** Stok Gecmisi (/envanter?tab=stockHistory): AuditService'in genel denetim
   * kaydini StockItem entity'sine gore filtreleyip tabloya uygun sekle cevirir. */
  async listHistory(query: StockHistoryQueryDto): Promise<StockMovementView[]> {
    const metaFilter: Record<string, string> = {};
    if (query.productId) metaFilter.productId = query.productId;
    if (query.warehouseId) metaFilter.warehouseId = query.warehouseId;
    const logs = await this.audit.list('StockItem', {
      userId: query.userId,
      meta: Object.keys(metaFilter).length > 0 ? metaFilter : undefined,
    });
    return logs.map((log) => {
      const meta = (log.meta ?? {}) as Record<string, unknown>;
      const quantity = Number(meta.quantity ?? 0);
      const previousQuantity = Number(meta.previousQuantity ?? 0);
      return {
        id: log.id,
        productId: String(meta.productId ?? ''),
        productName: String(meta.productName ?? '—'),
        warehouseId: String(meta.warehouseId ?? ''),
        warehouseName: String(meta.warehouseName ?? '—'),
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
