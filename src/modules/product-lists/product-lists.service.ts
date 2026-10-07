import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { ProductList } from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import { findIdsByTurkishSearch } from '../../core/db/turkish-search';
import { parseSort, type PagedResult } from '../../core/dto/list-query.dto';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { TenantContext } from '../../core/tenant/tenant-context';
import { AuditService } from '../audit/audit.service';
import type {
  CreateProductListDto,
  ProductListQueryDto,
  UpdateProductListDto,
} from './dto/product-list.dto';

const SORTABLE_FIELDS = ['name', 'createdAt'] as const;

export type ProductListWithCount = ProductList & { productCount: number };

@Injectable()
export class ProductListsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
  ) {}

  /** /urunler/yeni'deki "Ürün Listesi" seçicisi başka bir sekmede yeni bir liste
   * oluşturulunca sayfa yenilenmeden güncellensin diye (bkz. docs/YOL_HARITASI.md) -
   * Marka/Kategori/Birim ile aynı desen. */
  private async emitUpdated(): Promise<void> {
    const { tenantId } = TenantContext.getOrThrow();
    const lists = await this.prisma.productList.findMany({
      orderBy: { name: 'asc' },
    });
    this.realtime.emitToTenant(tenantId, 'productLists.updated', lists);
  }

  async list(
    query: ProductListQueryDto,
  ): Promise<PagedResult<ProductListWithCount>> {
    const { page, pageSize, q } = query;
    const { field, direction } = parseSort(query.sort, SORTABLE_FIELDS, {
      field: 'name',
      direction: 'asc',
    });

    // Postgres'in bu projede LC_CTYPE=C olmasi yuzunden `contains`/`mode: 'insensitive'`
    // Turkce aksanli karakterlerde (Ü, Ö, Ş, Ç, İ/ı) yanlis sonuc veriyor - bkz.
    // core/db/turkish-search.ts.
    const matchingIds = q
      ? await findIdsByTurkishSearch(
          this.prisma,
          'crm_product_lists',
          ['name'],
          q,
          { softDelete: true },
        )
      : null;

    const where = {
      ...(matchingIds ? { id: { in: matchingIds } } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.productList.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { [field]: direction },
        // Nested `_count`, tenant-scoped extension'dan gecmiyor (extension sadece
        // ust duzey model operasyonlarini yakaliyor) - silinmis urunleri disarida
        // birakmak icin deletedAt filtresi burada elle verilmeli.
        include: {
          _count: { select: { products: { where: { deletedAt: null } } } },
        },
      }),
      this.prisma.productList.count({ where }),
    ]);

    return {
      data: data.map(({ _count, ...productList }) => ({
        ...productList,
        productCount: _count.products,
      })),
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async getById(id: string): Promise<ProductList> {
    const productList = await this.prisma.productList.findFirst({
      where: { id },
    });
    if (!productList) {
      throw new AppException(
        'NOT_FOUND',
        'Urun listesi bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    return productList;
  }

  async create(dto: CreateProductListDto): Promise<ProductList> {
    // tenantId, tenant-scoped extension tarafindan calisma zamaninda eklenir
    const productList = await this.prisma.productList.create({
      data: { name: dto.name } as never,
    });
    await this.audit.log({
      action: 'CREATE',
      entity: 'ProductList',
      entityId: productList.id,
      meta: { name: productList.name },
    });
    await this.emitUpdated();
    return productList;
  }

  async update(id: string, dto: UpdateProductListDto): Promise<ProductList> {
    await this.getById(id);
    const productList = await this.prisma.productList.update({
      where: { id },
      data: dto,
    });
    await this.audit.log({
      action: 'UPDATE',
      entity: 'ProductList',
      entityId: id,
    });
    await this.emitUpdated();
    return productList;
  }

  async remove(id: string): Promise<void> {
    await this.getById(id);
    const productCount = await this.prisma.product.count({
      where: { productListId: id },
    });
    if (productCount > 0) {
      throw new AppException(
        'PRODUCT_LIST_NOT_EMPTY',
        'Bu urun listesinde urunler var. Once urunleri baska bir listeye tasiyin, sonra listeyi silin.',
        HttpStatus.CONFLICT,
        { productCount },
      );
    }
    await this.prisma.productList.delete({ where: { id } });
    await this.audit.log({
      action: 'DELETE',
      entity: 'ProductList',
      entityId: id,
    });
    await this.emitUpdated();
  }
}
