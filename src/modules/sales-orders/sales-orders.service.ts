import { InjectQueue } from '@nestjs/bullmq';
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
  SalesOrderItem,
} from '@prisma/client';
import type { Queue } from 'bullmq';
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
import {
  POST_SALE_SURVEY_QUEUE,
  SEND_POST_SALE_SURVEY_JOB,
} from '../../jobs/post-sale-survey-queue.constants';
import { PostSaleCasesCacheService } from '../post-sale-cases/post-sale-cases-cache.service';
import {
  DEFAULT_POST_SALE_FOLLOW_UP_DAYS,
  POST_SALE_FOLLOW_UP_DAYS_KEY,
} from '../tenant-settings/tenant-settings.constants';
import { SalesOrdersCacheService } from './sales-orders-cache.service';
import type {
  CreateSalesOrderDto,
  SalesOrderQueryDto,
  UpdateSalesOrderDto,
} from './dto/sales-order.dto';

const SORTABLE_FIELDS = ['orderNumber', 'createdAt'] as const;
const SALES_ORDER_NUMBER_CREATE_RETRIES = 3;

function salesOrderNumberPrefix(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `SAT-${yyyy}-${mm}-${dd}-`;
}

type SalesOrderItemWithProduct = SalesOrderItem & {
  product: Product & { productList: ProductList };
};

const SALES_ORDER_INCLUDE = {
  account: true,
  contact: true,
  quote: {
    include: {
      project: { select: { id: true, projectNumber: true, name: true } },
      items: { include: { product: { include: { productList: true } } } },
    },
  },
  items: { include: { product: { include: { productList: true } } } },
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
  items: SalesOrderItemWithProduct[];
};

@Injectable()
export class SalesOrdersService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly audit: AuditService,
    private readonly cache: SalesOrdersCacheService,
    @InjectQueue(POST_SALE_SURVEY_QUEUE)
    private readonly surveyQueue: Queue,
    private readonly postSaleCasesCache: PostSaleCasesCacheService,
  ) {}

  async list(
    query: SalesOrderQueryDto,
  ): Promise<PagedResult<SalesOrderWithQuote>> {
    const cached = await this.cache.get(query);
    if (cached) {
      return cached;
    }

    const { page, pageSize, accountId, status, createdById, q, from, to } =
      query;
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

  /**
   * Ad-hoc, kullanici istegi (bkz. CLAUDE.md): iki ayri yol.
   * 1) dto.quoteId verilirse: SalesOrder normalde Quote APPROVED olunca
   *    QuotesService.ensureSalesOrder tarafindan otomatik acilir - bu dal sadece
   *    bu otomasyondan ONCE onaylanmis (bu yuzden hic SalesOrder'i olmayan) eski
   *    teklifleri elle tamamlamak (backfill) icindir. Hesap/kisi Quote'tan
   *    kopyalanir, kalem yazilmaz (teklifli siparislerde kalemler hep Quote.items).
   * 2) dto.accountId + dto.items verilirse: 2026-10-13 kullanici geri bildirimi
   *    uzerine eklendi ("butun siparislerim bir teklifle iliskili olmak zorunda
   *    degil") - dogrudan firma + urun/miktar/birim fiyat girilerek, hic teklif
   *    olmadan bir SalesOrder acilir; kalemler kendi SalesOrderItem'inda tutulur.
   */
  async create(
    createdById: string,
    dto: CreateSalesOrderDto,
  ): Promise<SalesOrderWithQuote> {
    if (dto.quoteId) {
      return this.createFromQuote(createdById, dto.quoteId);
    }
    return this.createManual(createdById, dto);
  }

  private async createFromQuote(
    createdById: string,
    quoteId: string,
  ): Promise<SalesOrderWithQuote> {
    const quote = await this.prisma.quote.findFirst({ where: { id: quoteId } });
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
        'Satis siparisi ancak onaylanmis bir teklif icin olusturulabilir.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const existing = await this.prisma.salesOrder.findFirst({
      where: { quoteId },
    });
    if (existing) {
      throw new AppException(
        'SALES_ORDER_ALREADY_EXISTS',
        'Bu teklif icin zaten bir satis siparisi var.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const salesOrder = await this.createWithGeneratedNumber({
      quoteId: quote.id,
      accountId: quote.accountId,
      contactId: quote.contactId,
      createdById,
      items: [],
    });
    await this.audit.log({
      action: 'CREATE',
      entity: 'SalesOrder',
      entityId: salesOrder.id,
      meta: { quoteId: quote.id, orderNumber: salesOrder.orderNumber },
    });
    await this.cache.invalidate();
    await this.ensurePostSaleCase({
      salesOrderId: salesOrder.id,
      quoteId: quote.id,
      accountId: quote.accountId,
      contactId: quote.contactId,
    });
    return this.getById(salesOrder.id);
  }

  private async createManual(
    createdById: string,
    dto: CreateSalesOrderDto,
  ): Promise<SalesOrderWithQuote> {
    const accountId = dto.accountId as string;
    const items = dto.items ?? [];

    const account = await this.prisma.account.findFirst({
      where: { id: accountId },
    });
    if (!account) {
      throw new AppException(
        'NOT_FOUND',
        'Firma bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }

    const productIds = [...new Set(items.map((item) => item.productId))];
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, currency: true, brand: true },
    });
    if (products.length !== productIds.length) {
      throw new AppException(
        'PRODUCT_NOT_FOUND',
        'Secilen urunlerden biri bulunamadi.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const productById = new Map(products.map((p) => [p.id, p]));

    const salesOrder = await this.createWithGeneratedNumber({
      quoteId: null,
      accountId,
      contactId: dto.contactId ?? null,
      createdById,
      items: items.map((item) => {
        const product = productById.get(item.productId)!;
        return {
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          currency: item.currency ?? product.currency,
          discountPct: item.discountPct ?? 0,
          vatPct: item.vatPct ?? 0,
          brand: item.brand !== undefined ? item.brand || null : product.brand,
        };
      }),
    });
    await this.audit.log({
      action: 'CREATE',
      entity: 'SalesOrder',
      entityId: salesOrder.id,
      meta: { accountId, orderNumber: salesOrder.orderNumber },
    });
    await this.cache.invalidate();
    await this.ensurePostSaleCase({
      salesOrderId: salesOrder.id,
      quoteId: null,
      accountId,
      contactId: dto.contactId ?? null,
    });
    return this.getById(salesOrder.id);
  }

  /**
   * Ad-hoc (bkz. CLAUDE.md, kullanici istegi, docs/VARSAYIMLAR.md V68): PostSaleCase'in
   * TEK tetikleyicisi artik "bir SalesOrder olustu" - teklifli (quoteId dolu) veya
   * teklifsiz (manuel, quoteId null) farketmez. salesOrder.id yeni olusturuldugundan
   * (bu metod SADECE basariyla olusturulan bir SalesOrder'in hemen ardindan cagrilir)
   * idempotency/findFirst gerekmez - QuotesService.ensurePostSaleCase'in aksine (orada
   * ayni quoteId icin birden fazla APPROVED gecis denemesi olabiliyor).
   */
  private async ensurePostSaleCase(params: {
    salesOrderId: string;
    quoteId: string | null;
    accountId: string;
    contactId: string | null;
  }): Promise<void> {
    const setting = await this.prisma.tenantSetting.findFirst({
      where: { key: POST_SALE_FOLLOW_UP_DAYS_KEY },
    });
    const followUpDays =
      typeof setting?.value === 'number'
        ? setting.value
        : DEFAULT_POST_SALE_FOLLOW_UP_DAYS;
    const reminderAt = new Date(
      Date.now() + followUpDays * 24 * 60 * 60 * 1000,
    );

    const postSaleCase = await this.prisma.postSaleCase.create({
      data: {
        salesOrderId: params.salesOrderId,
        quoteId: params.quoteId,
        accountId: params.accountId,
        contactId: params.contactId,
        reminderAt,
      } as never,
    });
    await this.postSaleCasesCache.invalidate();
    if (postSaleCase.contactId) {
      await this.surveyQueue.add(SEND_POST_SALE_SURVEY_JOB, {
        postSaleCaseId: postSaleCase.id,
      });
    }
  }

  /** manuel yol ayri bir transaction'da calistigindan (ensureSalesOrder'daki gibi
   * Quote APPROVED gecis tx'ine gomulu degil) P2002'de (ayni gun ayni sayac
   * pozisyonunda es zamanli iki olusturma) PurchaseOrdersService.
   * createWithGeneratedNumber ile ayni desende retry edilebilir. */
  private async createWithGeneratedNumber(data: {
    quoteId: string | null;
    accountId: string;
    contactId: string | null;
    createdById: string;
    items: {
      productId: string;
      quantity: number;
      unitPrice: number;
      currency: string;
      discountPct: number;
      vatPct: number;
      brand: string | null;
    }[];
  }): Promise<SalesOrder> {
    for (
      let attempt = 0;
      attempt < SALES_ORDER_NUMBER_CREATE_RETRIES;
      attempt += 1
    ) {
      const prefix = salesOrderNumberPrefix(new Date());
      const countToday = await this.prisma.salesOrder.count({
        where: { orderNumber: { startsWith: prefix } },
      });
      const orderNumber = `${prefix}${String(countToday + 1).padStart(3, '0')}`;
      try {
        return await this.prisma.salesOrder.create({
          data: {
            quoteId: data.quoteId,
            accountId: data.accountId,
            contactId: data.contactId,
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
          attempt === SALES_ORDER_NUMBER_CREATE_RETRIES - 1
        ) {
          throw error;
        }
      }
    }
    throw new AppException(
      'SALES_ORDER_NUMBER_CONFLICT',
      'Siparis numarasi olusturulamadi, lutfen tekrar deneyin.',
      HttpStatus.CONFLICT,
    );
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
