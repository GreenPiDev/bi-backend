import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { Product, ProductList } from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import { parseSort, type PagedResult } from '../../core/dto/list-query.dto';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { AuditService } from '../audit/audit.service';
import { ProductsCacheService } from './products-cache.service';
import type {
  BulkMoveProductsDto,
  CreateProductDto,
  ProductQueryDto,
  UpdateProductDto,
} from './dto/product.dto';

const SORTABLE_FIELDS = ['name', 'sku', 'createdAt'] as const;

type ProductWithProductList = Product & { productList: ProductList };

export type ProductView = ProductWithProductList;

@Injectable()
export class ProductsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly audit: AuditService,
    private readonly cache: ProductsCacheService,
  ) {}

  async list(query: ProductQueryDto): Promise<PagedResult<ProductView>> {
    const cached = await this.cache.get(query);
    if (cached) {
      return cached;
    }

    const { page, pageSize, q, productListId } = query;
    const { field, direction } = parseSort(query.sort, SORTABLE_FIELDS, {
      field: 'name',
      direction: 'asc',
    });

    const where = {
      ...(productListId ? { productListId } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' as const } },
              { sku: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { [field]: direction },
        include: { productList: true },
      }),
      this.prisma.product.count({ where }),
    ]);

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
    await this.cache.invalidate();
    return product;
  }

  async update(id: string, dto: UpdateProductDto): Promise<ProductView> {
    await this.findOrThrow(id);
    const product = await this.prisma.product.update({
      where: { id },
      data: dto,
      include: { productList: true },
    });
    await this.audit.log({ action: 'UPDATE', entity: 'Product', entityId: id });
    await this.cache.invalidate();
    return product;
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
}
