import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { ProductList } from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import { parseSort, type PagedResult } from '../../core/dto/list-query.dto';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { AuditService } from '../audit/audit.service';
import type {
  CreateProductListDto,
  ProductListQueryDto,
  UpdateProductListDto,
} from './dto/product-list.dto';

const SORTABLE_FIELDS = ['name', 'createdAt'] as const;

@Injectable()
export class ProductListsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly audit: AuditService,
  ) {}

  async list(query: ProductListQueryDto): Promise<PagedResult<ProductList>> {
    const { page, pageSize, q } = query;
    const { field, direction } = parseSort(query.sort, SORTABLE_FIELDS, {
      field: 'name',
      direction: 'asc',
    });

    const where = {
      ...(q ? { name: { contains: q, mode: 'insensitive' as const } } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.productList.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { [field]: direction },
      }),
      this.prisma.productList.count({ where }),
    ]);

    return {
      data,
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
    const productList = await this.prisma.productList.create({
      // tenantId, tenant-scoped extension tarafindan calisma zamaninda eklenir
      data: { name: dto.name, isDefault: dto.isDefault ?? false } as never,
    });
    await this.audit.log({
      action: 'CREATE',
      entity: 'ProductList',
      entityId: productList.id,
      meta: { name: productList.name },
    });
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
    return productList;
  }

  async remove(id: string): Promise<void> {
    await this.getById(id);
    await this.prisma.productList.delete({ where: { id } });
    await this.audit.log({
      action: 'DELETE',
      entity: 'ProductList',
      entityId: id,
    });
  }
}
