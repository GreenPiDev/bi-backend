import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { PriceList, PriceListItem, Product } from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import { parseSort, type PagedResult } from '../../core/dto/list-query.dto';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { AuditService } from '../audit/audit.service';
import type {
  CreatePriceListDto,
  PriceListQueryDto,
  UpdatePriceListDto,
} from './dto/price-list.dto';

const SORTABLE_FIELDS = ['name', 'createdAt'] as const;

const PRICE_LIST_INCLUDE = {
  items: { include: { product: true } },
} as const;

export type PriceListWithItems = PriceList & {
  items: (PriceListItem & { product: Product })[];
};

@Injectable()
export class PriceListsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly audit: AuditService,
  ) {}

  async list(
    query: PriceListQueryDto,
  ): Promise<PagedResult<PriceListWithItems>> {
    const { page, pageSize, q } = query;
    const { field, direction } = parseSort(query.sort, SORTABLE_FIELDS, {
      field: 'createdAt',
      direction: 'desc',
    });

    const where = {
      ...(q ? { name: { contains: q, mode: 'insensitive' as const } } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.priceList.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { [field]: direction },
        include: PRICE_LIST_INCLUDE,
      }),
      this.prisma.priceList.count({ where }),
    ]);

    return {
      data,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async getById(id: string): Promise<PriceListWithItems> {
    const priceList = await this.prisma.priceList.findFirst({
      where: { id },
      include: PRICE_LIST_INCLUDE,
    });
    if (!priceList) {
      throw new AppException(
        'NOT_FOUND',
        'Fiyat listesi bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    return priceList;
  }

  async create(dto: CreatePriceListDto): Promise<PriceListWithItems> {
    const created = await this.prisma.$transaction(async (tx) => {
      const priceList = await tx.priceList.create({
        // tenantId, tenant-scoped extension tarafindan calisma zamaninda eklenir
        data: {
          name: dto.name,
          isDefault: dto.isDefault ?? false,
          ...(dto.items.length ? { items: { create: dto.items } } : {}),
        } as never,
      });
      return priceList.id;
    });
    await this.audit.log({
      action: 'CREATE',
      entity: 'PriceList',
      entityId: created,
      meta: { name: dto.name },
    });
    return this.getById(created);
  }

  async update(
    id: string,
    dto: UpdatePriceListDto,
  ): Promise<PriceListWithItems> {
    await this.getById(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.priceList.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
        },
      });
      if (dto.items) {
        await tx.priceListItem.deleteMany({ where: { priceListId: id } });
        if (dto.items.length) {
          await tx.priceListItem.createMany({
            data: dto.items.map((item) => ({ ...item, priceListId: id })),
          });
        }
      }
    });
    await this.audit.log({
      action: 'UPDATE',
      entity: 'PriceList',
      entityId: id,
    });
    return this.getById(id);
  }

  async remove(id: string): Promise<void> {
    await this.getById(id);
    await this.prisma.priceList.delete({ where: { id } });
    await this.audit.log({
      action: 'DELETE',
      entity: 'PriceList',
      entityId: id,
    });
  }
}
