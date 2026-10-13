import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  Account,
  Contact,
  Product,
  ProductList,
  Quote,
  QuoteItem,
  SalesOrder,
} from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import {
  findIdsBySql,
  qualifiedColumn,
  turkishContains,
} from '../../core/db/turkish-search';
import { parseSort, type PagedResult } from '../../core/dto/list-query.dto';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { TenantContext } from '../../core/tenant/tenant-context';
import { AuditService } from '../audit/audit.service';
import { SalesOrdersCacheService } from './sales-orders-cache.service';
import type {
  SalesOrderQueryDto,
  UpdateSalesOrderDto,
} from './dto/sales-order.dto';

const SORTABLE_FIELDS = ['orderNumber', 'createdAt'] as const;

const SALES_ORDER_INCLUDE = {
  account: true,
  contact: true,
  quote: {
    include: {
      project: { select: { id: true, projectNumber: true, name: true } },
      items: { include: { product: { include: { productList: true } } } },
    },
  },
} as const;

export type SalesOrderWithQuote = SalesOrder & {
  account: Account;
  contact: Contact | null;
  quote:
    | (Quote & {
        project: { id: string; projectNumber: string; name: string } | null;
        items: (QuoteItem & {
          product: Product & { productList: ProductList };
        })[];
      })
    | null;
};

@Injectable()
export class SalesOrdersService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly audit: AuditService,
    private readonly cache: SalesOrdersCacheService,
  ) {}

  async list(
    query: SalesOrderQueryDto,
  ): Promise<PagedResult<SalesOrderWithQuote>> {
    const cached = await this.cache.get(query);
    if (cached) {
      return cached;
    }

    const { page, pageSize, accountId, status, q } = query;
    const { field, direction } = parseSort(query.sort, SORTABLE_FIELDS, {
      field: 'createdAt',
      direction: 'desc',
    });

    // Postgres'in bu projede LC_CTYPE=C olmasi yuzunden `contains`/`mode: 'insensitive'`
    // Turkce aksanli karakterlerde yanlis sonuc veriyor - bkz. core/db/turkish-search.ts
    // (purchase-orders.service.ts ile ayni desen).
    const matchingIds = q
      ? await findIdsBySql(
          this.prisma,
          Prisma.sql`
            SELECT so."id" FROM "crm_sales_orders" so
            LEFT JOIN "crm_quotes" qt ON qt."id" = so."quoteId"
            LEFT JOIN "crm_accounts" a ON a."id" = so."accountId"
            WHERE so."tenantId" = ${TenantContext.getOrThrow().tenantId}
              AND (
                ${turkishContains(qualifiedColumn('so', 'orderNumber'), q)}
                OR ${turkishContains(qualifiedColumn('qt', 'quoteNumber'), q)}
                OR ${turkishContains(qualifiedColumn('a', 'name'), q)}
              )
          `,
        )
      : null;

    const where = {
      ...(matchingIds ? { id: { in: matchingIds } } : {}),
      ...(accountId ? { accountId } : {}),
      ...(status ? { status } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.salesOrder.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { [field]: direction },
        include: SALES_ORDER_INCLUDE,
      }),
      this.prisma.salesOrder.count({ where }),
    ]);

    const result = {
      data,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
    await this.cache.set(query, result);
    return result;
  }

  async getById(id: string): Promise<SalesOrderWithQuote> {
    const salesOrder = await this.prisma.salesOrder.findFirst({
      where: { id },
      include: SALES_ORDER_INCLUDE,
    });
    if (!salesOrder) {
      throw new AppException(
        'NOT_FOUND',
        'Satis siparisi bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    return salesOrder;
  }

  async updateStatus(
    id: string,
    dto: UpdateSalesOrderDto,
  ): Promise<SalesOrderWithQuote> {
    await this.getById(id);
    await this.prisma.salesOrder.update({
      where: { id },
      data: { status: dto.status },
    });
    await this.audit.log({
      action: 'UPDATE',
      entity: 'SalesOrder',
      entityId: id,
      meta: { status: dto.status },
    });
    await this.cache.invalidate();
    return this.getById(id);
  }
}
