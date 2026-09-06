import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { Product } from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import { parseSort, type PagedResult } from '../../core/dto/list-query.dto';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { AuditService } from '../audit/audit.service';
import type {
  CreateProductDto,
  ProductQueryDto,
  UpdateProductDto,
} from './dto/product.dto';

const SORTABLE_FIELDS = ['name', 'sku', 'createdAt'] as const;

@Injectable()
export class ProductsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly audit: AuditService,
  ) {}

  async list(query: ProductQueryDto): Promise<PagedResult<Product>> {
    const { page, pageSize, q } = query;
    const { field, direction } = parseSort(query.sort, SORTABLE_FIELDS, {
      field: 'name',
      direction: 'asc',
    });

    const where = {
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
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      data,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async getById(id: string): Promise<Product> {
    const product = await this.prisma.product.findFirst({ where: { id } });
    if (!product) {
      throw new AppException(
        'NOT_FOUND',
        'Urun bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    return product;
  }

  async create(dto: CreateProductDto): Promise<Product> {
    const product = await this.prisma.product.create({
      // tenantId, tenant-scoped extension tarafindan calisma zamaninda eklenir
      data: { ...dto } as never,
    });
    await this.audit.log({
      action: 'CREATE',
      entity: 'Product',
      entityId: product.id,
      meta: { name: product.name },
    });
    return product;
  }

  async update(id: string, dto: UpdateProductDto): Promise<Product> {
    await this.getById(id);
    const product = await this.prisma.product.update({
      where: { id },
      data: dto,
    });
    await this.audit.log({ action: 'UPDATE', entity: 'Product', entityId: id });
    return product;
  }

  async remove(id: string): Promise<void> {
    await this.getById(id);
    await this.prisma.product.delete({ where: { id } });
    await this.audit.log({ action: 'DELETE', entity: 'Product', entityId: id });
  }
}
