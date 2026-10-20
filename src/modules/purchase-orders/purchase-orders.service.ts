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

export interface PurchaseOrderDraft {
  accountId: string;
  quoteId: string;
  quoteNumber: string;
  items: {
    productId: string;
    productListId: string | null;
    productName: string;
    quantity: number;
  }[];
}

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

    const {
      page,
      pageSize,
      quoteId,
      projectId,
      status,
      createdById,
      q,
      from,
      to,
    } = query;
    const { field, direction } = parseSort(query.sort, SORTABLE_FIELDS, {
      field: 'createdAt',
      direction: 'desc',
    });

    // Postgres'in bu projede LC_CTYPE=C olmasi yuzunden `contains`/`mode: 'insensitive'`
    // Turkce aksanli karakterlerde (Ü, Ö, Ş, Ç, İ/ı) yanlis sonuc veriyor - bkz.
    // core/db/turkish-search.ts.
    const matchingIds = q
      ? await findIdsBySql(
          this.prisma,
          Prisma.sql`
            SELECT po."id" FROM "crm_purchase_orders" po
            LEFT JOIN "crm_quotes" qt ON qt."id" = po."quoteId"
            LEFT JOIN "crm_accounts" a ON a."id" = qt."accountId"
            LEFT JOIN "crm_projects" pr ON pr."id" = qt."projectId"
            WHERE po."tenantId" = ${TenantContext.getOrThrow().tenantId}
              AND po."deletedAt" IS NULL
              AND (
                ${turkishContains(qualifiedColumn('po', 'title'), q)}
                OR ${turkishContains(qualifiedColumn('po', 'orderNumber'), q)}
                OR ${turkishContains(qualifiedColumn('qt', 'quoteNumber'), q)}
                OR ${turkishContains(qualifiedColumn('a', 'name'), q)}
                OR ${turkishContains(qualifiedColumn('pr', 'name'), q)}
              )
          `,
        )
      : null;

    const where = {
      ...(matchingIds ? { id: { in: matchingIds } } : {}),
      ...(quoteId ? { quoteId } : {}),
      ...(projectId ? { quote: { projectId } } : {}),
      ...(status ? { status } : {}),
      ...(createdById ? { createdById } : {}),
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
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
   * Kalemler her zaman EXTRA kaynaklidir (kaynak artik PATCH disinda hic
   * olusturulmuyor - teklif onerisiyle gelen kalemler de kullanici burada
   * manuel kaydettigi icin EXTRA sayilir).
   *
   * Idempotent: `dto.clientRequestId` verilmisse (form her acildiginda bir kez
   * uretilen UUID), ayni kiracida ayni key ile once olusturulmus bir siparis
   * varsa onu dondurur, ikinci bir kayit ACMAZ - cift tiklama/agdan tekrar
   * deneme kaynakli duplicate siparis bug'ina karsi (bkz. schema.prisma
   * `PurchaseOrder.clientRequestId` yorumu). Es zamanli iki istek arasindaki
   * yarisi (TOCTOU) `@@unique([tenantId, clientRequestId])` + asagidaki P2002
   * yakalamasiyla kapatilir. */
  async create(
    createdById: string,
    dto: CreatePurchaseOrderDto,
  ): Promise<PurchaseOrderWithItems> {
    if (dto.clientRequestId) {
      const existing = await this.prisma.purchaseOrder.findFirst({
        where: { clientRequestId: dto.clientRequestId },
      });
      if (existing) {
        return this.getById(existing.id);
      }
    }

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

    let created: PurchaseOrder;
    try {
      created = await this.prisma.$transaction(async (tx) => {
        const order = await this.createWithGeneratedNumber(tx, {
          quoteId: dto.quoteId ?? null,
          title: dto.title ?? null,
          createdById,
          clientRequestId: dto.clientRequestId ?? null,
          items: dto.items.map((item) => ({
            productId: item.productId ?? null,
            description: item.description,
            quantity: item.quantity,
            source: 'EXTRA' as const,
          })),
        });
        return order;
      });
    } catch (error) {
      // Iki es zamanli istek ayni clientRequestId ile yarisirsa (TOCTOU - yukaridaki
      // findFirst her ikisinde de bos donmus olabilir), kaybeden tarafi hataya
      // dusurmek yerine kazananin kaydini dondururuz - gercek idempotency budur.
      if (
        dto.clientRequestId &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        (error.meta?.target as string[] | undefined)?.includes(
          'clientRequestId',
        )
      ) {
        const existing = await this.prisma.purchaseOrder.findFirst({
          where: { clientRequestId: dto.clientRequestId },
        });
        if (existing) {
          return this.getById(existing.id);
        }
      }
      throw error;
    }

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
      title?: string | null;
      createdById: string;
      clientRequestId?: string | null;
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
            title: data.title ?? null,
            orderNumber,
            createdById: data.createdById,
            clientRequestId: data.clientRequestId ?? null,
            items: { create: data.items },
          } as never,
        });
      } catch (error) {
        const isDuplicateNumber =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002' &&
          !(error.meta?.target as string[] | undefined)?.includes(
            'clientRequestId',
          );
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
   * SP1-SP2: onayli bir teklif icin onerilen siparis kalemlerini (urun +
   * stoktan dusulmus miktar) dondurur - herhangi bir kayit olusturmaz. Kullanici
   * bu oneriyi /siparisler/yeni formunda gorup duzenler, kaydi `create()` ile
   * kendisi olusturur (bkz. QuotesController.getPurchaseOrderDraft).
   */
  async getDraftFromQuote(quoteId: string): Promise<PurchaseOrderDraft> {
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

    return {
      accountId: quote.accountId,
      quoteId: quote.id,
      quoteNumber: quote.quoteNumber,
      items: quote.items.map((quoteItem) => {
        const stockQuantity =
          stockQuantityByProduct.get(quoteItem.productId) ?? 0;
        const neededQuantity = Math.max(
          Number(quoteItem.quantity) - stockQuantity,
          0,
        );
        return {
          productId: quoteItem.productId,
          productListId: quoteItem.product.productListId,
          productName: quoteItem.product.name,
          quantity: neededQuantity,
        };
      }),
    };
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
      if (dto.title !== undefined) {
        await tx.purchaseOrder.update({
          where: { id },
          data: { title: dto.title },
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

    // Ad-hoc (2026-10-20, kullanici istegi, bkz. CLAUDE.md): dto.items ve dto.status
    // mevcut frontend cagri yerlerinde (duzenleme formu vs. liste/detay durum
    // dropdown'u) birbirini DISLAR, bu yuzden ikisi ayni cagrida gelmez - bkz.
    // SalesOrdersService.updateStatus/setItemDeliveredQuantity ile ayni ikili kural:
    // kalemler degisince durum otomatik yeniden hesaplanir, durum elle FULLY_RECEIVED'a
    // cekilince kalemler otomatik tam teslim alinmis isaretlenir.
    if (dto.status === 'FULLY_RECEIVED') {
      await this.markActiveItemsFullyReceived(id);
    } else if (dto.items) {
      await this.syncStatusWithReceivingState(id);
    }

    await this.audit.log({
      action: 'UPDATE',
      entity: 'PurchaseOrder',
      entityId: id,
    });
    await this.cache.invalidate();
    return this.getById(id);
  }

  /**
   * Ad-hoc (2026-10-20, kullanici istegi, bkz. CLAUDE.md): siparis elle "Tamamen
   * Teslim Alındı" (FULLY_RECEIVED) durumuna cekildiginde, iptal olmayan TUM
   * kalemlerin receivedQuantity'si kendi quantity'sine esitlenir -
   * syncStatusWithReceivingState ile AYNI kuralin ters yonu (bkz.
   * SalesOrdersService.markActiveItemsFullyDelivered ile ayni desen).
   */
  private async markActiveItemsFullyReceived(id: string): Promise<void> {
    const purchaseOrder = await this.getById(id);
    const activeItems = purchaseOrder.items.filter((item) => !item.isCancelled);
    await Promise.all(
      activeItems.map((item) =>
        this.prisma.purchaseOrderItem.update({
          where: { id: item.id },
          data: { receivedQuantity: item.quantity },
        }),
      ),
    );
  }

  /**
   * Ad-hoc (2026-10-20, kullanici istegi, bkz. CLAUDE.md): kalem teslim alma/iptal
   * durumu her degistiginde siparisin durumunu kalemlerin toplu durumuna gore
   * otomatik yeniden hesaplar - iptal olmayan kalemlerin TUMU teslim alindiysa
   * FULLY_RECEIVED ("Tamamen Teslim Alındı"), HICBIRI teslim alinmadiysa CONFIRMED
   * ("Onaylandı"), aksi halde (karisik) PARTIALLY_RECEIVED ("Kısmen Teslim
   * Alındı"). CANCELLED/COMPLETED siparislerde calismaz (bunlar nihai, kullanici
   * bilincli sectigi durumlar - frontend zaten bu durumlarda kalem
   * duzenlemelerini engelliyor, burasi ayni kurali savunma amacli tekrarliyor;
   * bkz. SalesOrdersService.syncStatusWithDeliveryState ile ayni desen). Hicbir
   * iptal-olmayan kalem yoksa durum degistirilmez.
   */
  private async syncStatusWithReceivingState(id: string): Promise<void> {
    const purchaseOrder = await this.getById(id);
    if (
      purchaseOrder.status === 'CANCELLED' ||
      purchaseOrder.status === 'COMPLETED'
    ) {
      return;
    }

    const activeItems = purchaseOrder.items.filter((item) => !item.isCancelled);
    if (activeItems.length === 0) {
      return;
    }

    const allReceived = activeItems.every(
      (item) => Number(item.receivedQuantity) >= Number(item.quantity),
    );
    const noneReceived = activeItems.every(
      (item) => Number(item.receivedQuantity) <= 0,
    );
    const autoStatus = allReceived
      ? 'FULLY_RECEIVED'
      : noneReceived
        ? 'CONFIRMED'
        : 'PARTIALLY_RECEIVED';

    if (autoStatus === purchaseOrder.status) {
      return;
    }
    await this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: autoStatus },
    });
  }

  /**
   * Ad-hoc (2026-10-20, kullanici istegi, bkz. CLAUDE.md): kalemin
   * receivedQuantity'sini dogrudan verilen degere esitler - hem kismi teslim
   * alma hem kismi geri alma AYNI bu tek uc uzerinden yapilir (bkz.
   * SalesOrdersService.setItemDeliveredQuantity ile ayni desen).
   */
  async setItemReceivedQuantity(
    id: string,
    itemId: string,
    receivedQuantity: number,
  ): Promise<PurchaseOrderWithItems> {
    const purchaseOrder = await this.getById(id);
    const item = purchaseOrder.items.find((i) => i.id === itemId);
    if (!item) {
      throw new AppException(
        'NOT_FOUND',
        'Siparis kalemi bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }

    if (receivedQuantity < 0 || receivedQuantity > Number(item.quantity)) {
      throw new AppException(
        'INVALID_RECEIVED_QUANTITY',
        `Teslim alinan miktar 0 ile ${item.quantity} arasinda olmalidir.`,
        HttpStatus.BAD_REQUEST,
      );
    }

    await this.prisma.purchaseOrderItem.update({
      where: { id: itemId },
      data: { receivedQuantity },
    });

    await this.syncStatusWithReceivingState(id);

    await this.audit.log({
      action: 'UPDATE',
      entity: 'PurchaseOrder',
      entityId: id,
      meta: { itemId, receivedQuantity },
    });
    await this.cache.invalidate();
    return this.getById(id);
  }

  /**
   * Ad-hoc (2026-10-20, kullanici istegi, bkz. CLAUDE.md): kalemi "tedarikciden
   * beklenmeyecek" olarak isaretler/isareti geri alir - receivedQuantity'den
   * BAGIMSIZDIR (bkz. SalesOrdersService.setItemCancelled ile ayni desen).
   */
  async setItemCancelled(
    id: string,
    itemId: string,
    isCancelled: boolean,
  ): Promise<PurchaseOrderWithItems> {
    const purchaseOrder = await this.getById(id);
    const item = purchaseOrder.items.find((i) => i.id === itemId);
    if (!item) {
      throw new AppException(
        'NOT_FOUND',
        'Siparis kalemi bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }

    await this.prisma.purchaseOrderItem.update({
      where: { id: itemId },
      data: { isCancelled },
    });

    await this.syncStatusWithReceivingState(id);

    await this.audit.log({
      action: 'UPDATE',
      entity: 'PurchaseOrder',
      entityId: id,
      meta: { itemId, isCancelled },
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
