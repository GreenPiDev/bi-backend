import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Product, ProductList } from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import { parseSort, type PagedResult } from '../../core/dto/list-query.dto';
import { PrismaService } from '../../core/prisma/prisma.service';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { TenantContext } from '../../core/tenant/tenant-context';
import { AuditService } from '../audit/audit.service';
import { ProductPriceHistoryCacheService } from './product-price-history-cache.service';
import { ProductsCacheService } from './products-cache.service';
import type {
  BulkDeleteProductsDto,
  BulkMoveProductsDto,
  CreateProductDto,
  ProductQueryDto,
  UpdateProductDto,
} from './dto/product.dto';

const SORTABLE_FIELDS = ['name', 'sku', 'createdAt'] as const;

type ProductWithProductList = Product & { productList: ProductList };

export type ProductView = ProductWithProductList;

/**
 * /envanter?tab=products'ta stok miktarini da gostermek icin (kullanici talebi,
 * bkz. CLAUDE.md) - StockItem 1:1 iliskiyle join edilip tek bir "quantity" alanina
 * indirgeniyor, /stok sayfasindaki "henuz hic miktar girilmemis urun icin 0" davranisiyla
 * tutarli (bkz. stock-items.service.ts resolveRows). Sadece list() bu alani tasir,
 * create/update/getById'in mevcut ProductView sozlesmesi degismedi.
 */
export type ProductListItem = ProductWithProductList & {
  stockQuantity: Prisma.Decimal;
};

/** Fiyat Gecmisi (/envanter?tab=priceHistory): ayrik bir PriceHistory modeli yerine,
 * StockItemsService.listHistory ile ayni desen - AuditLog'un 'ProductPrice' entity'sine
 * gore filtrelenmis hali (bkz. logPriceChange). */
export interface ProductPriceMovementView {
  id: string;
  productId: string;
  productName: string;
  userName: string;
  userEmail: string;
  previousPrice: number | null;
  previousCurrency: string | null;
  price: number | null;
  currency: string;
  createdAt: Date;
}

@Injectable()
export class ProductsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly rawPrisma: PrismaService,
    private readonly audit: AuditService,
    private readonly cache: ProductsCacheService,
    private readonly priceHistoryCache: ProductPriceHistoryCacheService,
  ) {}

  async list(query: ProductQueryDto): Promise<PagedResult<ProductListItem>> {
    const cached = await this.cache.get(query);
    if (cached) {
      return cached;
    }

    const {
      page,
      pageSize,
      q,
      productListId,
      brand,
      category,
      attr,
      includeDeleted,
    } = query;
    const { field, direction } = parseSort(query.sort, SORTABLE_FIELDS, {
      field: 'name',
      direction: 'asc',
    });

    const attrConditions = attr
      ? Object.entries(attr).map(([key, value]) => ({
          attributes: {
            path: [key],
            string_contains: value,
            mode: 'insensitive' as const,
          },
        }))
      : [];

    const where = {
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
      ...(attrConditions.length > 0 ? { AND: attrConditions } : {}),
    };

    // "Silinmis Urunleri Goster" acikken tenant-scoped extension'in otomatik
    // "deletedAt: null" filtresini atlamamiz gerekiyor - extension bu filtreyi
    // sadece where.deletedAt === undefined ise ekliyor, ama biz "hem aktif hem
    // silinmis" istedigimizde ekstra bir Prisma filtre degeri de yazamayiz.
    // Bu yuzden bu tek durumda extension'siz ham client'a gecip tenantId'yi
    // elle ekliyoruz (bkz. getAttributeKeys() ayni desen icin $queryRaw kullaniyor).
    const [rows, total] = includeDeleted
      ? await Promise.all([
          this.rawPrisma.product.findMany({
            where: { ...where, tenantId: TenantContext.getOrThrow().tenantId },
            skip: (page - 1) * pageSize,
            take: pageSize,
            orderBy: { [field]: direction },
            include: { productList: true, stockItems: true },
          }),
          this.rawPrisma.product.count({
            where: { ...where, tenantId: TenantContext.getOrThrow().tenantId },
          }),
        ])
      : await Promise.all([
          this.prisma.product.findMany({
            where,
            skip: (page - 1) * pageSize,
            take: pageSize,
            orderBy: { [field]: direction },
            include: { productList: true, stockItems: true },
          }),
          this.prisma.product.count({ where }),
        ]);

    // Stok miktarini /stok sayfasindaki ayni desenle (resolveRows) tek alana indirgiyoruz:
    // henuz hic StockItem kaydi olmayan urun icin 0 sayilir.
    const data: ProductListItem[] = rows.map((row) => {
      const { stockItems, ...productFields } = row;
      return {
        ...(productFields as ProductWithProductList),
        stockQuantity: stockItems[0]?.quantity ?? new Prisma.Decimal(0),
      };
    });

    const result = {
      data,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
    await this.cache.set(query, result);
    return result;
  }

  async getById(id: string): Promise<ProductView> {
    return this.findOrThrow(id);
  }

  /**
   * Faz B (attributes JSONB, bkz. docs/VARSAYIMLAR.md V40) icin: tenant genelinde,
   * urun listesinden bagimsiz, kullanimda olan tum ozel alan adlarinin (ornek: "Seri")
   * distinct havuzu - filtre panelinde dinamik metin alani render etmek icin.
   * tenant-scoped extension raw sorgulari kapsamiyor, bu yuzden tenantId elle eklenir.
   */
  async getAttributeKeys(): Promise<string[]> {
    const { tenantId } = TenantContext.getOrThrow();
    const rows = await this.prisma.$queryRaw<{ key: string }[]>`
      SELECT DISTINCT jsonb_object_keys(attributes) as key
      FROM crm_products
      WHERE "tenantId" = ${tenantId}
        AND "deletedAt" IS NULL
        AND attributes IS NOT NULL
      ORDER BY key
    `;
    return rows.map((row) => row.key);
  }

  private async findOrThrow(id: string): Promise<ProductWithProductList> {
    const product = await this.prisma.product.findFirst({
      where: { id },
      include: { productList: true },
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

  async create(dto: CreateProductDto): Promise<ProductView> {
    const product = await this.prisma.product.create({
      // tenantId, tenant-scoped extension tarafindan calisma zamaninda eklenir
      data: { ...dto } as never,
      include: { productList: true },
    });
    await this.audit.log({
      action: 'CREATE',
      entity: 'Product',
      entityId: product.id,
      meta: { name: product.name },
    });
    if (dto.price !== undefined && dto.price !== null) {
      await this.logPriceChange(
        'CREATE',
        product.id,
        product.name,
        null,
        null,
        dto.price,
        product.currency,
      );
    }
    await this.cache.invalidate();
    return product;
  }

  async update(id: string, dto: UpdateProductDto): Promise<ProductView> {
    const existing = await this.findOrThrow(id);
    const product = await this.prisma.product.update({
      where: { id },
      data: dto,
      include: { productList: true },
    });
    await this.audit.log({ action: 'UPDATE', entity: 'Product', entityId: id });
    if (
      dto.price !== undefined &&
      Number(dto.price ?? 0) !== Number(existing.price ?? 0)
    ) {
      await this.logPriceChange(
        'UPDATE',
        product.id,
        product.name,
        existing.price,
        existing.currency,
        dto.price,
        dto.currency ?? product.currency,
      );
    }
    await this.cache.invalidate();
    return product;
  }

  /** Urunun fiyati olusturulurken/guncellenirken degistiginde 'ProductPrice' adinda
   * ayri bir denetim-kaydi kovasina yazar - listPriceHistory bunu filtreler. Ayri bir
   * DB modeli (PriceHistory) yerine StockItemsService.upsertByProductId ile ayni,
   * AuditLog-tabanli desen kullanildi. */
  private async logPriceChange(
    action: 'CREATE' | 'UPDATE',
    productId: string,
    productName: string,
    previousPrice: Prisma.Decimal | null,
    previousCurrency: string | null,
    price: number | null,
    currency: string,
  ): Promise<void> {
    await this.audit.log({
      action,
      entity: 'ProductPrice',
      entityId: productId,
      meta: {
        productId,
        productName,
        previousPrice,
        previousCurrency,
        price,
        currency,
      },
    });
    await this.priceHistoryCache.invalidate(productId);
  }

  /** Fiyat Gecmisi (/envanter?tab=priceHistory): AuditService'in genel denetim kaydini
   * 'ProductPrice' entity'sine gore filtreleyip tabloya uygun sekle cevirir - bkz.
   * StockItemsService.listHistory ile ayni desen. */
  async listPriceHistory(query: {
    productId?: string;
    userId?: string;
  }): Promise<ProductPriceMovementView[]> {
    // Sadece tek-urun sorgusu (UI'nin /envanter?tab=priceHistory'de satir
    // genisletince kullandigi tek yol) cache'lenir - bkz.
    // ProductPriceHistoryCacheService. productId'siz/userId'li genel listeleme
    // birden fazla urunu kapsadigi icin dogrudan DB'den okunur.
    const cacheable = Boolean(query.productId) && !query.userId;
    if (cacheable) {
      const cached = await this.priceHistoryCache.get(query.productId!);
      if (cached) {
        return cached;
      }
    }

    const logs = await this.audit.list('ProductPrice', {
      userId: query.userId,
      meta: query.productId ? { productId: query.productId } : undefined,
    });
    const result = logs.map((log) => {
      const meta = (log.meta ?? {}) as Record<string, unknown>;
      return {
        id: log.id,
        productId: String(meta.productId ?? ''),
        productName: String(meta.productName ?? '—'),
        userName: log.userName,
        userEmail: log.userEmail,
        previousPrice:
          meta.previousPrice != null ? Number(meta.previousPrice) : null,
        // Eski kayitlarda previousCurrency yok (bkz. commit gecmisi) - o kayitlar
        // icin currency'ye dusuluyor, tek bilgi kaynagi oydu.
        previousCurrency:
          meta.previousPrice != null
            ? String(meta.previousCurrency ?? meta.currency ?? 'TRY')
            : null,
        price: meta.price != null ? Number(meta.price) : null,
        currency: String(meta.currency ?? 'TRY'),
        createdAt: log.createdAt,
      };
    });

    if (cacheable) {
      await this.priceHistoryCache.set(query.productId!, result);
    }
    return result;
  }

  async remove(id: string): Promise<void> {
    await this.findOrThrow(id);
    await this.prisma.product.delete({ where: { id } });
    await this.audit.log({ action: 'DELETE', entity: 'Product', entityId: id });
    await this.cache.invalidate();
  }

  async bulkMove(dto: BulkMoveProductsDto): Promise<{ movedCount: number }> {
    const targetList = await this.prisma.productList.findFirst({
      where: { id: dto.targetProductListId },
    });
    if (!targetList) {
      throw new AppException(
        'NOT_FOUND',
        'Hedef urun listesi bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }

    const result = await this.prisma.product.updateMany({
      where: { id: { in: dto.productIds } },
      data: { productListId: dto.targetProductListId },
    });

    await this.audit.log({
      action: 'UPDATE',
      entity: 'ProductList',
      entityId: dto.targetProductListId,
      meta: {
        bulkMoveProductIds: dto.productIds,
        movedCount: result.count,
      },
    });
    await this.cache.invalidate();
    return { movedCount: result.count };
  }

  async bulkRemove(
    dto: BulkDeleteProductsDto,
  ): Promise<{ deletedCount: number }> {
    const result = await this.prisma.product.deleteMany({
      where: { id: { in: dto.productIds } },
    });

    await this.audit.log({
      action: 'DELETE',
      entity: 'Product',
      entityId: dto.productIds.join(','),
      meta: {
        bulkDeleteProductIds: dto.productIds,
        deletedCount: result.count,
      },
    });
    await this.cache.invalidate();
    return { deletedCount: result.count };
  }
}
