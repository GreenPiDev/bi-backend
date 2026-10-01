import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  Product,
  Project,
  PurchaseOrder,
  PurchaseOrderItem,
  Quote,
} from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import { parseSort, type PagedResult } from '../../core/dto/list-query.dto';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { AuditService } from '../audit/audit.service';
import { PurchaseOrdersCacheService } from './purchase-orders-cache.service';
import type {
  CreatePurchaseOrderDto,
  PurchaseOrderQueryDto,
  UpdatePurchaseOrderDto,
} from './dto/purchase-order.dto';

const SORTABLE_FIELDS = ['orderNumber', 'createdAt'] as const;
const PURCHASE_ORDER_NUMBER_CREATE_RETRIES = 5;

const PURCHASE_ORDER_INCLUDE = {
  items: { include: { product: true }, orderBy: { createdAt: 'asc' as const } },
  quote: { include: { project: true } },
} as const;

export type PurchaseOrderWithItems = PurchaseOrder & {
  items: (PurchaseOrderItem & { product: Product | null })[];
  quote: (Quote & { project: Project | null }) | null;
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
    private readonly cache: PurchaseOrdersCacheService,
  ) {}

  async list(
    query: PurchaseOrderQueryDto,
  ): Promise<PagedResult<PurchaseOrderWithItems>> {
    const cached = await this.cache.get(query);
    if (cached) {
      return cached;
    }

    const { page, pageSize, quoteId, projectId, status } = query;
    const { field, direction } = parseSort(query.sort, SORTABLE_FIELDS, {
      field: 'createdAt',
      direction: 'desc',
    });

    const where = {
      ...(quoteId ? { quoteId } : {}),
      ...(projectId ? { quote: { projectId } } : {}),
      ...(status ? { status } : {}),
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

    const result = {
      data,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
    await this.cache.set(query, result);
    return result;
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

  /** /siparisler/yeni: teklif zorunlu degil, quoteId opsiyonel bir baglantidir.
   * Kalemler her zaman EXTRA kaynaklidir (SP1'deki QUOTE kaynagi sadece
   * createFromQuote akisina ozgudur). */
  async create(
    createdById: string,
    dto: CreatePurchaseOrderDto,
  ): Promise<PurchaseOrderWithItems> {
    if (dto.quoteId) {
      const quote = await this.prisma.quote.findFirst({
        where: { id: dto.quoteId },
      });
      if (!quote) {
        throw new AppException(
          'NOT_FOUND',
          'Teklif bulunamadi.',
          HttpStatus.NOT_FOUND,
        );
      }
    }

    const productIds = [
      ...new Set(
        dto.items
          .map((item) => item.productId)
          .filter((id): id is string => !!id),
      ),
    ];
    if (productIds.length) {
      const products = await this.prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true },
      });
      if (products.length !== productIds.length) {
        throw new AppException(
          'PRODUCT_NOT_FOUND',
          'Secilen urunlerden biri bulunamadi.',
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const order = await this.createWithGeneratedNumber(tx, {
        quoteId: dto.quoteId ?? null,
        createdById,
        items: dto.items.map((item) => ({
          productId: item.productId ?? null,
          description: item.description,
          quantity: item.quantity,
          source: 'EXTRA' as const,
        })),
      });
      return order;
    });

    await this.audit.log({
      action: 'CREATE',
      entity: 'PurchaseOrder',
      entityId: created.id,
      meta: { orderNumber: created.orderNumber },
    });
    await this.cache.invalidate();
    return this.getById(created.id);
  }

  private async createWithGeneratedNumber(
    tx: Pick<TenantPrismaClient, 'purchaseOrder'>,
    data: {
      quoteId: string | null;
      createdById: string;
      items: {
        productId: string | null;
        description: string;
        quantity: number;
        source: 'QUOTE' | 'EXTRA';
      }[];
    },
  ): Promise<PurchaseOrder> {
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
        return await tx.purchaseOrder.create({
          data: {
            quoteId: data.quoteId,
            orderNumber,
            createdById: data.createdById,
            items: { create: data.items },
          } as never,
        });
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
    throw new AppException(
      'PURCHASE_ORDER_NUMBER_CONFLICT',
      'Siparis numarasi olusturulamadi, lutfen tekrar deneyin.',
      HttpStatus.CONFLICT,
    );
  }

  /**
   * SP1-SP3: onayli bir teklifden siparis olusturur.
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

    const productIds = [...new Set(quote.items.map((item) => item.productId))];
    const stockItems = productIds.length
      ? await this.prisma.stockItem.findMany({
          where: { productId: { in: productIds } },
        })
      : [];
    // Birden fazla depoda stogu olan bir urunun toplam miktari, SP2'deki "mevcut
    // stok" hesabinda depolar arasi toplanir (bkz. CLAUDE.md, cok depolu stok
    // ad-hoc genislemesi).
    const stockQuantityByProduct = new Map<string, number>();
    for (const stockItem of stockItems) {
      stockQuantityByProduct.set(
        stockItem.productId,
        (stockQuantityByProduct.get(stockItem.productId) ?? 0) +
          Number(stockItem.quantity),
      );
    }

    const itemsData = quote.items.map((quoteItem) => {
      const stockQuantity =
        stockQuantityByProduct.get(quoteItem.productId) ?? 0;
      const neededQuantity = Math.max(
        Number(quoteItem.quantity) - stockQuantity,
        0,
      );
      return {
        productId: quoteItem.productId,
        description: '',
        quantity: neededQuantity,
        source: 'QUOTE' as const,
      };
    });

    const created = await this.prisma.$transaction((tx) =>
      this.createWithGeneratedNumber(tx, {
        quoteId: quote.id,
        createdById,
        items: itemsData,
      }),
    );

    await this.audit.log({
      action: 'CREATE',
      entity: 'PurchaseOrder',
      entityId: created.id,
      meta: { orderNumber: created.orderNumber },
    });
    await this.cache.invalidate();
    return this.getById(created.id);
  }

  async update(
    id: string,
    dto: UpdatePurchaseOrderDto,
  ): Promise<PurchaseOrderWithItems> {
    await this.getById(id);

    if (dto.quoteId) {
      const quote = await this.prisma.quote.findFirst({
        where: { id: dto.quoteId },
      });
      if (!quote) {
        throw new AppException(
          'NOT_FOUND',
          'Teklif bulunamadi.',
          HttpStatus.NOT_FOUND,
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      if (dto.quoteId !== undefined) {
        await tx.purchaseOrder.update({
          where: { id },
          data: { quoteId: dto.quoteId },
        });
      }
      if (dto.items) {
        const productIds = [
          ...new Set(
            dto.items
              .map((item) => item.productId)
              .filter((id): id is string => !!id),
          ),
        ];
        if (productIds.length) {
          const products = await tx.product.findMany({
            where: { id: { in: productIds } },
            select: { id: true },
          });
          if (products.length !== productIds.length) {
            throw new AppException(
              'PRODUCT_NOT_FOUND',
              'Secilen urunlerden biri bulunamadi.',
              HttpStatus.BAD_REQUEST,
            );
          }
        }

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
    await this.cache.invalidate();
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
    await this.cache.invalidate();
  }
}
