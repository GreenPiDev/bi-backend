import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Product, StockItem, StockMovementType } from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import { findIdsByTurkishSearch } from '../../core/db/turkish-search';
import { parseSort, type PagedResult } from '../../core/dto/list-query.dto';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { TenantContext } from '../../core/tenant/tenant-context';
import { ProductsCacheService } from '../products/products-cache.service';
import type {
  DecreaseStockDto,
  IncreaseStockDto,
  StockHistoryQueryDto,
  StockItemQueryDto,
  TransferStockDto,
} from './dto/stock-item.dto';
import { getStockStatus, STOCK_STATUS_SORT_ORDER } from './stock-status.util';

/** `$transaction`'in callback'ine Prisma'nin gectigi `tx` client'in tipi - tenant-scoped
 * extension'li client uzerinden turetilir ki extension'in enjekte ettigi tenantId filtresi
 * tx icinde de gecerli olsun (bkz. QuotesService'teki ayni desen, `this.prisma.$transaction`). */
export type StockTx = Parameters<
  Parameters<TenantPrismaClient['$transaction']>[0]
>[0];

/** Postgres SERIALIZABLE izolasyonunda yazma catismasi (iki eszamanli stok girisi/cikisi
 * ayni urune carpisirsa) Prisma'nin P2034 hatasiyla sinyallenir - Prisma'nin resmi onerisi
 * bu hatada islemi yeniden denemektir (bkz. docs/PLAN_STOK_MALIYET.md Faz 2). */
const STOCK_WRITE_MAX_RETRIES = 3;

/** AuditService.list'teki LIST_LIMIT ile ayni desen - stok gecmisi tek seferde tum
 * listeyi ister (sayfalama yok), asiri buyumeyi onlemek icin ust sinir. */
const STOCK_HISTORY_LIST_LIMIT = 200;

async function runSerializableStockWrite<T>(
  prisma: TenantPrismaClient,
  fn: (tx: StockTx) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; attempt <= STOCK_WRITE_MAX_RETRIES; attempt++) {
    try {
      return await prisma.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      const isSerializationConflict =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034';
      if (!isSerializationConflict || attempt === STOCK_WRITE_MAX_RETRIES) {
        throw error;
      }
    }
  }
  // Teorik olarak ulasilmaz: dongu ya basariyla doner ya da son denemede firlatir.
  throw new Error('runSerializableStockWrite: beklenmeyen dongu sonu.');
}

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
  type: StockMovementType;
  note: string | null;
  previousQuantity: number;
  quantity: number;
  newQuantity: number;
  delta: number;
  /** Sadece INCREASE'de dolu. */
  unitCost: number | null;
  previousAvgCost: number | null;
  newAvgCost: number | null;
  /** QUOTE_SALE'in hangi teklifin onayindan geldigi (Faz 4). */
  quoteId: string | null;
  createdAt: Date;
}

/** Henuz hic miktar girilmemis (StockItem kaydi olmayan) urunler icin de bir
 * satir uretmek amaciyla kullanilan sentetik id - StockItemsController hicbir
 * yerde bu id'yi PK olarak yazmaya calismaz, artis/azalis uclari her zaman
 * productId + warehouseId ile calisir. */
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
  const parsed = parseSort(sort, ['name', 'quantity'], {
    field: 'status',
    direction: 'asc',
  });
  if (parsed.field === 'name') {
    const dir = parsed.direction === 'asc' ? 1 : -1;
    return [...rows].sort(
      (a, b) => dir * a.product.name.localeCompare(b.product.name, 'tr'),
    );
  }
  if (parsed.field === 'quantity') {
    const dir = parsed.direction === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => dir * a.quantity.comparedTo(b.quantity));
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
    private readonly productsCache: ProductsCacheService,
  ) {}

  /** /teklifler/:id "Stok Kontrolu" sekmesi icin: verilen urun id'lerinin tum
   * depolardaki mevcut miktarini dondurur (StockItem kaydi olmayan urun/depo
   * ciftleri haritada hic yer almaz - cagiran taraf eksik anahtari 0 kabul eder). */
  async getStockByProductIds(
    productIds: string[],
  ): Promise<Map<string, StockItemWarehouseBreakdown[]>> {
    const byProduct = new Map<string, StockItemWarehouseBreakdown[]>();
    if (productIds.length === 0) {
      return byProduct;
    }
    const stockItems = await this.prisma.stockItem.findMany({
      where: { productId: { in: productIds } },
      include: { warehouse: true },
    });
    for (const item of stockItems) {
      const list = byProduct.get(item.productId) ?? [];
      list.push({
        warehouseId: item.warehouseId,
        warehouseName: item.warehouse.name,
        quantity: item.quantity,
      });
      byProduct.set(item.productId, list);
    }
    return byProduct;
  }

  /**
   * /urunler'de tanimli her urun /stok'ta bir satir olarak gorunur - toplam miktar
   * hic girilmemisse (hicbir depoda StockItem kaydi yoksa) 0 miktarli "sanal" bir
   * satir uretilir (ilk stok girisiyle gercek satira doner). Aksi
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
    // Postgres'in bu projede LC_CTYPE=C olmasi yuzunden `contains`/`mode: 'insensitive'`
    // Turkce aksanli karakterlerde (Ü, Ö, Ş, Ç, İ/ı) yanlis sonuc veriyor - bkz.
    // core/db/turkish-search.ts.
    const matchingIds = q
      ? await findIdsByTurkishSearch(
          this.prisma,
          'crm_products',
          ['name', 'sku'],
          q,
          {
            softDelete: true,
          },
        )
      : null;
    const products = await this.prisma.product.findMany({
      where: {
        ...(matchingIds ? { id: { in: matchingIds } } : {}),
        ...(productListId ? { productListId } : {}),
        ...(brand ? { brand } : {}),
        ...(category ? { category } : {}),
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
    const cached = await this.productsCache.getLowStock();
    if (cached) {
      return cached;
    }
    const rows = await this.resolveRows();
    const lowStockRows = rows.filter((row) => {
      const minStockLevel = row.product.minStockLevel;
      if (minStockLevel === null || minStockLevel === undefined) {
        return false;
      }
      return Number(row.quantity) <= minStockLevel;
    });
    await this.productsCache.setLowStock(lowStockRows);
    return lowStockRows;
  }

  private async requireProduct(
    productId: string,
    tx: StockTx = this.prisma,
  ): Promise<Product> {
    const product = await tx.product.findFirst({
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
    tx: StockTx = this.prisma,
  ): Promise<{ id: string; name: string }> {
    const warehouse = await tx.warehouse.findFirst({
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

  /**
   * Stok girisi (INCREASE) - WAC (hareketli agirlikli ortalama maliyet) hesabinin
   * kalbi, bkz. docs/PLAN_STOK_MALIYET.md Faz 2. Maliyet urun bazinda tutuldugu icin
   * (depo bazinda degil) oldTotalQty bu urunun TUM depolardaki toplam miktaridir.
   * `tx` disaridan verilirse (bkz. Faz 4 - teklif onayinda kullanilacak) o transaction
   * icinde calisir; verilmezse kendi SERIALIZABLE transaction'ini acar.
   */
  private async increaseStockTx(
    tx: StockTx,
    params: {
      productId: string;
      warehouseId: string;
      quantity: number;
      unitCost: number;
      note?: string | null;
    },
  ): Promise<void> {
    const product = await this.requireProduct(params.productId, tx);
    await this.requireWarehouse(params.warehouseId, tx);

    const stockItems = await tx.stockItem.findMany({
      where: { productId: params.productId },
    });
    const oldTotalQty = stockItems.reduce(
      (sum, si) => sum.add(si.quantity),
      new Prisma.Decimal(0),
    );
    const oldAvgCost = new Prisma.Decimal(product.avgCost ?? 0);
    const quantity = new Prisma.Decimal(params.quantity);
    const unitCost = new Prisma.Decimal(params.unitCost);
    const newTotalQty = oldTotalQty.add(quantity);
    const newAvgCost = newTotalQty.isZero()
      ? unitCost
      : oldTotalQty
          .mul(oldAvgCost)
          .add(quantity.mul(unitCost))
          .div(newTotalQty);

    const existing = stockItems.find(
      (si) => si.warehouseId === params.warehouseId,
    );
    const previousQuantity = new Prisma.Decimal(existing?.quantity ?? 0);
    const newQuantity = previousQuantity.add(quantity);

    if (existing) {
      await tx.stockItem.update({
        where: { id: existing.id },
        data: { quantity: newQuantity },
      });
    } else {
      await tx.stockItem.create({
        data: {
          productId: params.productId,
          warehouseId: params.warehouseId,
          quantity: newQuantity,
        } as never,
      });
    }

    await tx.product.update({
      where: { id: params.productId },
      data: { avgCost: newAvgCost },
    });

    const actingUserId = TenantContext.getOrThrow().userId;
    await tx.stockMovement.create({
      data: {
        productId: params.productId,
        warehouseId: params.warehouseId,
        type: 'INCREASE',
        quantity,
        unitCost,
        previousAvgCost: product.avgCost,
        newAvgCost,
        previousQuantity,
        newQuantity,
        note: params.note ?? null,
        createdById: actingUserId,
      } as never,
    });
  }

  async increaseStock(
    productId: string,
    dto: IncreaseStockDto,
  ): Promise<StockItemWithProduct> {
    await runSerializableStockWrite(this.prisma, (tx) =>
      this.increaseStockTx(tx, { productId, ...dto }),
    );
    await this.productsCache.invalidate();
    return this.refreshRow(productId);
  }

  /**
   * Stok cikisi - DECREASE (elle), QUOTE_SALE (teklif onayi, Faz 4) veya CORRECTION
   * icin paylasilan cekirdek. Maliyeti DEGISTIRMEZ, sadece miktari dusurur. Negatife
   * dusmeye izin verilir (bkz. docs/PLAN_STOK_MALIYET.md karar 6) - stok henuz
   * gelmemis olsa da satis onaylanabilmeli.
   *
   * Bilerek `private` degil: QuotesService.ensureStockDecreaseForQuote (Faz 4) kendi
   * `$transaction`'i icinden bunu dogrudan cagirir ki teklif onayi + stok dususu
   * ATOMIK olsun (biri basarisiz olursa digeri de geri alinsin).
   */
  async decreaseStockTx(
    tx: StockTx,
    params: {
      productId: string;
      warehouseId: string;
      quantity: number;
      type: StockMovementType;
      quoteId?: string | null;
      note?: string | null;
    },
  ): Promise<void> {
    const product = await this.requireProduct(params.productId, tx);
    await this.requireWarehouse(params.warehouseId, tx);

    const existing = await tx.stockItem.findFirst({
      where: { productId: params.productId, warehouseId: params.warehouseId },
    });
    const previousQuantity = new Prisma.Decimal(existing?.quantity ?? 0);
    const quantity = new Prisma.Decimal(params.quantity);
    const newQuantity = previousQuantity.sub(quantity);

    if (existing) {
      await tx.stockItem.update({
        where: { id: existing.id },
        data: { quantity: newQuantity },
      });
    } else {
      await tx.stockItem.create({
        data: {
          productId: params.productId,
          warehouseId: params.warehouseId,
          quantity: newQuantity,
        } as never,
      });
    }

    const actingUserId = TenantContext.getOrThrow().userId;
    await tx.stockMovement.create({
      data: {
        productId: params.productId,
        warehouseId: params.warehouseId,
        type: params.type,
        quantity,
        unitCost: null,
        previousAvgCost: product.avgCost,
        newAvgCost: product.avgCost,
        previousQuantity,
        newQuantity,
        quoteId: params.quoteId ?? null,
        note: params.note ?? null,
        createdById: actingUserId,
      } as never,
    });
  }

  async decreaseStock(
    productId: string,
    dto: DecreaseStockDto,
  ): Promise<StockItemWithProduct> {
    await runSerializableStockWrite(this.prisma, (tx) =>
      this.decreaseStockTx(tx, { productId, type: 'DECREASE', ...dto }),
    );
    await this.productsCache.invalidate();
    return this.refreshRow(productId);
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

  /** Ad-hoc (bkz. CLAUDE.md): bir urunun stogunu bir depodan diger bir depoya
   * tasir. Maliyet urun bazinda oldugu icin (bkz. docs/PLAN_STOK_MALIYET.md)
   * transfer Product.avgCost'u HIC etkilemez - sadece iki StockItem satirinin
   * miktarini degistirir. Iki StockMovement satiri (TRANSFER_OUT/TRANSFER_IN)
   * `relatedMovementId` ile birbirine baglanir. */
  private async transferStockTx(
    tx: StockTx,
    params: {
      productId: string;
      fromWarehouseId: string;
      toWarehouseId: string;
      quantity: number;
      note?: string;
    },
  ): Promise<void> {
    await this.requireProduct(params.productId, tx);
    const fromWarehouse = await this.requireWarehouse(
      params.fromWarehouseId,
      tx,
    );
    const toWarehouse = await this.requireWarehouse(params.toWarehouseId, tx);

    const fromStockItem = await tx.stockItem.findFirst({
      where: {
        productId: params.productId,
        warehouseId: params.fromWarehouseId,
      },
    });
    const fromQuantity = new Prisma.Decimal(fromStockItem?.quantity ?? 0);
    const quantity = new Prisma.Decimal(params.quantity);
    if (quantity.gt(fromQuantity)) {
      throw new AppException(
        'INSUFFICIENT_STOCK',
        `Kaynak depoda yeterli stok yok (mevcut: ${fromQuantity.toString()}).`,
        HttpStatus.BAD_REQUEST,
        { available: fromQuantity.toNumber() },
      );
    }

    const toStockItem = await tx.stockItem.findFirst({
      where: { productId: params.productId, warehouseId: params.toWarehouseId },
    });
    const toQuantity = new Prisma.Decimal(toStockItem?.quantity ?? 0);

    const newFromQuantity = fromQuantity.sub(quantity);
    const newToQuantity = toQuantity.add(quantity);
    const note = params.note?.trim() || undefined;

    await tx.stockItem.update({
      where: { id: (fromStockItem as StockItem).id },
      data: { quantity: newFromQuantity },
    });

    if (toStockItem) {
      await tx.stockItem.update({
        where: { id: toStockItem.id },
        data: { quantity: newToQuantity },
      });
    } else {
      await tx.stockItem.create({
        data: {
          productId: params.productId,
          warehouseId: params.toWarehouseId,
          quantity: newToQuantity,
        } as never,
      });
    }

    const actingUserId = TenantContext.getOrThrow().userId;
    const outMovement = await tx.stockMovement.create({
      data: {
        productId: params.productId,
        warehouseId: params.fromWarehouseId,
        type: 'TRANSFER_OUT',
        quantity,
        unitCost: null,
        previousAvgCost: null,
        newAvgCost: null,
        previousQuantity: fromQuantity,
        newQuantity: newFromQuantity,
        note: note ?? `${toWarehouse.name} deposuna tasindi.`,
        createdById: actingUserId,
      } as never,
    });
    await tx.stockMovement.create({
      data: {
        productId: params.productId,
        warehouseId: params.toWarehouseId,
        type: 'TRANSFER_IN',
        quantity,
        unitCost: null,
        previousAvgCost: null,
        newAvgCost: null,
        previousQuantity: toQuantity,
        newQuantity: newToQuantity,
        relatedMovementId: (outMovement as { id: string }).id,
        note: note ?? `${fromWarehouse.name} deposundan tasindi.`,
        createdById: actingUserId,
      } as never,
    });
  }

  async transferStock(
    productId: string,
    dto: TransferStockDto,
  ): Promise<StockItemWithProduct> {
    await runSerializableStockWrite(this.prisma, (tx) =>
      this.transferStockTx(tx, { productId, ...dto }),
    );
    await this.productsCache.invalidate();
    return this.refreshRow(productId);
  }

  /** Stok Gecmisi (/envanter?tab=stockHistory) - bkz. docs/PLAN_STOK_MALIYET.md Faz 3.
   * Eskiden AuditLog'un meta JSON'undan yeniden kuruluyordu; artik gercek StockMovement
   * tablosundan okur. Kullanici adi/e-postasi AuditService.hydrateUsers ile ayni desen:
   * StockMovement sadece createdById tutar, isim/e-posta User tablosundan join'lenir. */
  async listHistory(query: StockHistoryQueryDto): Promise<StockMovementView[]> {
    const movements = await this.prisma.stockMovement.findMany({
      where: {
        ...(query.productId ? { productId: query.productId } : {}),
        ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
        ...(query.userId ? { createdById: query.userId } : {}),
        ...(query.types?.length ? { type: { in: query.types } } : {}),
      },
      include: { product: true, warehouse: true },
      orderBy: { createdAt: 'desc' },
      take: STOCK_HISTORY_LIST_LIMIT,
    });

    const userIds = [...new Set(movements.map((m) => m.createdById))];
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
    });
    const usersById = new Map(users.map((u) => [u.id, u]));

    return movements.map((m) => {
      const user = usersById.get(m.createdById);
      return {
        id: m.id,
        productId: m.productId,
        productName: m.product.name,
        warehouseId: m.warehouseId,
        warehouseName: m.warehouse.name,
        userName: user?.name ?? '—',
        userEmail: user?.email ?? '—',
        type: m.type,
        note: m.note,
        previousQuantity: Number(m.previousQuantity),
        quantity: Number(m.quantity),
        newQuantity: Number(m.newQuantity),
        delta: Number(m.newQuantity) - Number(m.previousQuantity),
        unitCost: m.unitCost != null ? Number(m.unitCost) : null,
        previousAvgCost:
          m.previousAvgCost != null ? Number(m.previousAvgCost) : null,
        newAvgCost: m.newAvgCost != null ? Number(m.newAvgCost) : null,
        quoteId: m.quoteId,
        createdAt: m.createdAt,
      };
    });
  }
}
