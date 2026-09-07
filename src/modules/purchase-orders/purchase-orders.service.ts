import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Product, PurchaseOrder, PurchaseOrderItem } from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import { parseSort, type PagedResult } from '../../core/dto/list-query.dto';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { AuditService } from '../audit/audit.service';
import type {
  PurchaseOrderQueryDto,
  UpdatePurchaseOrderDto,
} from './dto/purchase-order.dto';

const SORTABLE_FIELDS = ['orderNumber', 'createdAt'] as const;
const PURCHASE_ORDER_NUMBER_CREATE_RETRIES = 5;

const PURCHASE_ORDER_INCLUDE = {
  items: { include: { product: true }, orderBy: { createdAt: 'asc' as const } },
} as const;

export type PurchaseOrderWithItems = PurchaseOrder & {
  items: (PurchaseOrderItem & { product: Product | null })[];
};

function purchaseOrderNumberPrefix(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `SIP-${yyyy}-${mm}-${dd}-`;
}

@Injectable()
export class PurchaseOrdersService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly audit: AuditService,
  ) {}

  async list(
    query: PurchaseOrderQueryDto,
  ): Promise<PagedResult<PurchaseOrderWithItems>> {
    const { page, pageSize, quoteId, projectId } = query;
    const { field, direction } = parseSort(query.sort, SORTABLE_FIELDS, {
      field: 'createdAt',
      direction: 'desc',
    });

    const where = {
      ...(quoteId ? { quoteId } : {}),
      ...(projectId ? { projectId } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.purchaseOrder.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { [field]: direction },
        include: PURCHASE_ORDER_INCLUDE,
      }),
      this.prisma.purchaseOrder.count({ where }),
    ]);

    return {
      data,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async getById(id: string): Promise<PurchaseOrderWithItems> {
    const purchaseOrder = await this.prisma.purchaseOrder.findFirst({
      where: { id },
      include: PURCHASE_ORDER_INCLUDE,
    });
    if (!purchaseOrder) {
      throw new AppException(
        'NOT_FOUND',
        'Siparis bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    return purchaseOrder;
  }

  /**
   * SP1-SP3: onayli bir teklifden siparis olusturur. Sadece
   * QuotesController'daki POST /quotes/:id/create-purchase-order ucu cagirir,
   * dogrudan bir POST /purchase-orders ucu yoktur.
   */
  async createFromQuote(
    createdById: string,
    quoteId: string,
  ): Promise<PurchaseOrderWithItems> {
    const quote = await this.prisma.quote.findFirst({
      where: { id: quoteId },
      include: { items: { include: { product: true } } },
    });
    if (!quote) {
      throw new AppException(
        'NOT_FOUND',
        'Teklif bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    if (quote.status !== 'APPROVED') {
      throw new AppException(
        'QUOTE_NOT_APPROVED',
        'Sadece onaylanmis tekliflerden siparis olusturulabilir.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const project = await this.prisma.project.findFirst({
      where: { quoteId: quote.id },
    });

    const productIds = [...new Set(quote.items.map((item) => item.productId))];
    const stockItems = productIds.length
      ? await this.prisma.stockItem.findMany({
          where: { productId: { in: productIds } },
        })
      : [];
    const stockQuantityByProduct = new Map(
      stockItems.map((stockItem) => [
        stockItem.productId,
        Number(stockItem.quantity),
      ]),
    );

    const itemsData = quote.items.map((quoteItem) => {
      const stockQuantity =
        stockQuantityByProduct.get(quoteItem.productId) ?? 0;
      const neededQuantity = Math.max(
        Number(quoteItem.quantity) - stockQuantity,
        0,
      );
      return {
        productId: quoteItem.productId,
        description: quoteItem.product.name,
        quantity: neededQuantity,
        source: 'QUOTE' as const,
      };
    });

    const created = await this.prisma.$transaction(async (tx) => {
      let createdOrder: PurchaseOrder | undefined;
      for (
        let attempt = 0;
        attempt < PURCHASE_ORDER_NUMBER_CREATE_RETRIES;
        attempt += 1
      ) {
        const prefix = purchaseOrderNumberPrefix(new Date());
        const countToday = await tx.purchaseOrder.count({
          where: { orderNumber: { startsWith: prefix } },
        });
        const orderNumber = `${prefix}${String(countToday + 1).padStart(3, '0')}`;
        try {
          createdOrder = await tx.purchaseOrder.create({
            data: {
              quoteId: quote.id,
              projectId: project?.id ?? null,
              orderNumber,
              createdById,
              items: { create: itemsData },
            } as never,
          });
          break;
        } catch (error) {
          const isDuplicateNumber =
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2002';
          if (
            !isDuplicateNumber ||
            attempt === PURCHASE_ORDER_NUMBER_CREATE_RETRIES - 1
          ) {
            throw error;
          }
        }
      }
      if (!createdOrder) {
        throw new AppException(
          'PURCHASE_ORDER_NUMBER_CONFLICT',
          'Siparis numarasi olusturulamadi, lutfen tekrar deneyin.',
          HttpStatus.CONFLICT,
        );
      }
      return createdOrder;
    });

    await this.audit.log({
      action: 'CREATE',
      entity: 'PurchaseOrder',
      entityId: created.id,
      meta: { orderNumber: created.orderNumber },
    });
    return this.getById(created.id);
  }

  async update(
    id: string,
    dto: UpdatePurchaseOrderDto,
  ): Promise<PurchaseOrderWithItems> {
    await this.getById(id);

    await this.prisma.$transaction(async (tx) => {
      if (dto.items) {
        await tx.purchaseOrderItem.deleteMany({
          where: { purchaseOrderId: id },
        });
        await tx.purchaseOrderItem.createMany({
          data: dto.items.map((item) => ({
            purchaseOrderId: id,
            productId: item.productId ?? null,
            description: item.description,
            quantity: item.quantity,
            source: item.source,
          })),
        });
      }
      if (dto.status) {
        await tx.purchaseOrder.update({
          where: { id },
          data: { status: dto.status },
        });
      }
    });

    await this.audit.log({
      action: 'UPDATE',
      entity: 'PurchaseOrder',
      entityId: id,
    });
    return this.getById(id);
  }

  async remove(id: string): Promise<void> {
    await this.getById(id);
    await this.prisma.purchaseOrder.delete({ where: { id } });
    await this.audit.log({
      action: 'DELETE',
      entity: 'PurchaseOrder',
      entityId: id,
    });
  }
}
