import { InjectQueue } from '@nestjs/bullmq';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  Account,
  Contact,
  Opportunity,
  Product,
  ProductList,
  Quote,
  QuoteItem,
  QuoteTemplate,
} from '@prisma/client';
import type { Queue } from 'bullmq';
import { AppException } from '../../core/errors/app.exception';
import {
  findIdsBySql,
  qualifiedColumn,
  turkishContains,
} from '../../core/db/turkish-search';
import { parseSort, type PagedResult } from '../../core/dto/list-query.dto';
import { FxService, type FxRatesResult } from '../../core/fx/fx.service';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { FileUrlService } from '../../core/storage/file-url.service';
import { TenantContext } from '../../core/tenant/tenant-context';
import {
  POST_SALE_SURVEY_QUEUE,
  SEND_POST_SALE_SURVEY_JOB,
} from '../../jobs/post-sale-survey-queue.constants';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { OpportunitiesCacheService } from '../opportunities/opportunities-cache.service';
import { PostSaleCasesCacheService } from '../post-sale-cases/post-sale-cases-cache.service';
import { ProductsCacheService } from '../products/products-cache.service';
import {
  StockItemsService,
  type StockTx,
} from '../stock-items/stock-items.service';
import {
  DEFAULT_POST_SALE_FOLLOW_UP_DAYS,
  POST_SALE_FOLLOW_UP_DAYS_KEY,
} from '../tenant-settings/tenant-settings.constants';
import { QuotesCacheService } from './quotes-cache.service';
import type {
  ApproveQuoteDto,
  CreateQuoteDto,
  QuoteExchangeRatesDto,
  QuoteItemInputDto,
  QuoteQueryDto,
  RejectQuoteDto,
  UpdateQuoteDto,
} from './dto/quote.dto';

const SORTABLE_FIELDS = ['quoteNumber', 'createdAt'] as const;
const QUOTE_NUMBER_CREATE_RETRIES = 5;

const QUOTE_INCLUDE = {
  account: true,
  contact: true,
  opportunity: true,
  template: true,
  project: { select: { id: true, projectNumber: true, name: true } },
  items: { include: { product: { include: { productList: true } } } },
} as const;

export type QuoteWithDetails = Quote & {
  account: Account;
  contact: Contact | null;
  opportunity: Opportunity | null;
  template: QuoteTemplate | null;
  project: { id: string; projectNumber: string; name: string } | null;
  items: (QuoteItem & { product: Product & { productList: ProductList } })[];
  createdByName: string | null;
};

export interface QuotePrintTemplateData {
  id: string;
  name: string;
  logoUrl: string | null;
  coverImageUrl: string | null;
  closingImageUrl: string | null;
  companyDisplayName: string;
  companyTagline: string | null;
}

/** Tenant.address/phone/email (bkz. docs/VARSAYIMLAR.md, "sirket bilgileri") - sablonlu
 * ve sablonsuz PDF'in ikisi de aynI tek, tenant-genel kaynaktan okur. */
export interface QuotePrintCompanyData {
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
}

/** Quote.senderId -> User (bkz. doc comment'i) - teklifin "gonderen"i, PDF'te
 * gosterilen temsilci bilgisi. */
export interface QuotePrintSenderData {
  name: string;
  title: string | null;
  phone: string | null;
  email: string;
}

export type QuotePrintData = Omit<QuoteWithDetails, 'template'> & {
  template: QuotePrintTemplateData | null;
  company: QuotePrintCompanyData;
  sender: QuotePrintSenderData | null;
};

type QuoteRow = Quote & {
  account: Account;
  contact: Contact | null;
  opportunity: Opportunity | null;
  template: QuoteTemplate | null;
  project: { id: string; projectNumber: string; name: string } | null;
  items: (QuoteItem & { product: Product & { productList: ProductList } })[];
};

interface EnsuredPostSaleCase {
  id: string;
  contactId: string | null;
}

type PostSaleCaseTx = Pick<
  TenantPrismaClient,
  'postSaleCase' | 'tenantSetting'
>;

interface ResolvedQuoteItem {
  productId: string;
  quantity: number;
  unitPrice: number | Prisma.Decimal;
  currency: string;
  discountPct: number;
  vatPct: number;
  discountNote: string | null;
  costPriceAtSale: Prisma.Decimal | null;
}

type ItemResolutionTx = Pick<TenantPrismaClient, 'product'>;

type StatusHistoryTx = Pick<TenantPrismaClient, 'quoteStatusHistory'>;

export interface QuoteStatusHistoryEntry {
  id: string;
  status: Quote['status'];
  reason: string | null;
  note: string | null;
  createdAt: Date;
  createdByName: string | null;
}

/** /teklifler/:id "Stok Kontrolu" sekmesi - teklifteki her urun satiri + o urunun
 * tenant'in tum depolarindaki mevcut miktari. Teklif onaylaninca gercekten dusulecek
 * miktari degil, su anki anlik durumu gosterir (salt-okunur, kayit olusturmaz). */
export interface QuoteStockCheckRow {
  productId: string;
  productName: string;
  productSku: string | null;
  unit: string;
  quoteQuantity: number;
  stockByWarehouseId: Record<string, number>;
  totalStock: number;
}

export interface QuoteStockCheckResult {
  warehouses: { id: string; name: string }[];
  items: QuoteStockCheckRow[];
}

/** Ad-hoc revizyon takibi (bkz. Quote.revisionSnapshot doc comment'i): kaydedilen
 * onceki kalemlerin/kurun frontend'in mevcut quote-totals.ts hesaplayicilarina
 * (groupQuoteItemTotals/convertTotalsToQuoteCurrency) dogrudan verilebilecek sekli. */
export interface QuoteRevisionSnapshot {
  items: {
    productName: string;
    quantity: number;
    unitPrice: number;
    currency: string;
    discountPct: number;
    vatPct: number;
  }[];
  quoteCurrency: string;
  exchangeRates: { asOf?: string; rates: Record<string, number> } | null;
}

function quoteNumberPrefix(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `TEK-${yyyy}-${mm}-${dd}-`;
}

@Injectable()
export class QuotesService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly audit: AuditService,
    @InjectQueue(POST_SALE_SURVEY_QUEUE)
    private readonly surveyQueue: Queue,
    private readonly quotesCache: QuotesCacheService,
    private readonly opportunitiesCache: OpportunitiesCacheService,
    private readonly postSaleCasesCache: PostSaleCasesCacheService,
    private readonly productsCache: ProductsCacheService,
    private readonly fx: FxService,
    private readonly fileUrl: FileUrlService,
    private readonly notifications: NotificationsService,
    private readonly stockItems: StockItemsService,
  ) {}

  /** Teklif para birimi secim formu icin guncel kur (otomatik on-doldurma, kullanici
   * elle duzenleyebilir - bkz. Quote.exchangeRates doc comment'i). */
  async getFxRates(base: string, targetsCsv: string): Promise<FxRatesResult> {
    const targets = targetsCsv
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    return this.fx.getRatesToBase(base, targets);
  }

  /** quoteCurrency disindaki her item para biriminin exchangeRates.rates icinde
   * karsiligi olmali - aksi halde tek bir genel toplam hesaplanamaz. */
  private assertExchangeRatesCoverItems(
    quoteCurrency: string,
    items: { currency: string }[],
    exchangeRates: QuoteExchangeRatesDto | undefined,
  ): void {
    const foreignCurrencies = [
      ...new Set(
        items.map((item) => item.currency).filter((c) => c !== quoteCurrency),
      ),
    ];
    if (foreignCurrencies.length === 0) {
      return;
    }
    const rates = exchangeRates?.rates as Record<string, number> | undefined;
    const missing = foreignCurrencies.filter(
      (currency) => rates?.[currency] === undefined,
    );
    if (missing.length > 0) {
      throw new AppException(
        'MISSING_EXCHANGE_RATE',
        `Su para birimleri icin kur bilgisi eksik: ${missing.join(', ')}.`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * S1 (bkz. docs/VARSAYIMLAR.md V28): Quote.status APPROVED'a ulastigi HER an
   * (create/update/approve - ucu de bu metodu cagirir) idempotent bir PostSaleCase
   * acar. reminderAt, tenant'in postSaleFollowUpDays ayariyla hesaplanir (S2).
   */
  private async ensurePostSaleCase(
    tx: PostSaleCaseTx,
    params: {
      quoteId: string;
      accountId: string;
      contactId: string | null;
      approvedAt: Date;
    },
  ): Promise<EnsuredPostSaleCase> {
    const setting = await tx.tenantSetting.findFirst({
      where: { key: POST_SALE_FOLLOW_UP_DAYS_KEY },
    });
    const followUpDays =
      typeof setting?.value === 'number'
        ? setting.value
        : DEFAULT_POST_SALE_FOLLOW_UP_DAYS;
    const reminderAt = new Date(
      params.approvedAt.getTime() + followUpDays * 24 * 60 * 60 * 1000,
    );

    // tenant-scoped extension yalnizca create/createMany'e tenantId enjekte
    // eder (upsert desteklenmiyor) - bu yuzden findFirst + create kullanilir,
    // Quote.postSaleCase 1:1 oldugu icin idempotency findFirst ile saglanir.
    const existing = await tx.postSaleCase.findFirst({
      where: { quoteId: params.quoteId },
    });
    if (existing) {
      return { id: existing.id, contactId: existing.contactId };
    }

    const postSaleCase = await tx.postSaleCase.create({
      data: {
        quoteId: params.quoteId,
        accountId: params.accountId,
        contactId: params.contactId,
        reminderAt,
      } as never,
    });

    return { id: postSaleCase.id, contactId: postSaleCase.contactId };
  }

  /**
   * Faz 4 (bkz. docs/PLAN_STOK_MALIYET.md): Quote.status APPROVED'a ulastigi HER an
   * (update/approve - ensurePostSaleCase ile ayni iki nokta) teklif kalemlerindeki
   * urunleri secilen depodan otomatik duser. Idempotent: bu teklife ait QUOTE_SALE
   * hareketi zaten varsa (ayni teklifin iki ayri yoldan APPROVED'a "gecmeye"
   * calisilmasi - ensurePostSaleCase'deki findFirst idempotency'siyle ayni risk)
   * tekrar dusmez. Maliyeti (Product.avgCost) DEGISTIRMEZ (karar 4), yetersiz stokta
   * negatife dusmeye izin verilir (karar 6) - onay hic engellenmez.
   */
  private async ensureStockDecreaseForQuote(
    tx: StockTx,
    params: {
      quoteId: string;
      quoteNumber: string;
      warehouseId: string;
      items: { productId: string; quantity: Prisma.Decimal | number }[];
    },
  ): Promise<void> {
    const alreadyApplied = await tx.stockMovement.findFirst({
      where: { quoteId: params.quoteId },
    });
    if (alreadyApplied) {
      return;
    }
    for (const item of params.items) {
      await this.stockItems.decreaseStockTx(tx, {
        productId: item.productId,
        warehouseId: params.warehouseId,
        quantity: Number(item.quantity),
        type: 'QUOTE_SALE',
        quoteId: params.quoteId,
        note: `Teklif ${params.quoteNumber} onayi`,
      });
    }
  }

  /** Odeme yontemi, tenant'in tanimladigi listeye karsi dogrulanir - sektor
   * alaniyla ayni desen (bkz. AccountsService.assertValidSector). Tenant henuz
   * hic odeme yontemi tanimlamadiysa serbest metin kabul edilir. */
  private async assertValidPaymentMethod(
    paymentMethod: string | undefined,
  ): Promise<void> {
    if (!paymentMethod) {
      return;
    }
    const options = await this.prisma.paymentMethodOption.findMany();
    if (options.length === 0) {
      return;
    }
    if (!options.some((option) => option.label === paymentMethod)) {
      throw new AppException(
        'INVALID_PAYMENT_METHOD',
        'Belirtilen odeme yontemi tanimli degil.',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /** Secilen IbanOption'in 4 alanini teklife kopyalanacak sekilde doner - FK degil,
   * QuoteItem.unitPrice ile ayni "olusturma anindaki degeri koru" deseni (bkz.
   * IbanOption doc comment'i). ibanOptionId verilmezse tum alanlar null doner. */
  private async resolveIbanSnapshot(
    ibanOptionId: string | null | undefined,
  ): Promise<{
    ibanBankName: string | null;
    ibanAccountHolderName: string | null;
    ibanAccountNumber: string | null;
    ibanNumber: string | null;
  }> {
    if (!ibanOptionId) {
      return {
        ibanBankName: null,
        ibanAccountHolderName: null,
        ibanAccountNumber: null,
        ibanNumber: null,
      };
    }
    const option = await this.prisma.ibanOption.findFirst({
      where: { id: ibanOptionId },
    });
    if (!option) {
      throw new AppException(
        'IBAN_NOT_FOUND',
        'Secilen IBAN tanimli degil.',
        HttpStatus.BAD_REQUEST,
      );
    }
    return {
      ibanBankName: option.bankName,
      ibanAccountHolderName: option.accountHolderName,
      ibanAccountNumber: option.accountNumber,
      ibanNumber: option.iban,
    };
  }

  /** Ad-hoc: markali PDF sablonu (bkz. docs/VARSAYIMLAR.md V41). `templateId`
   * verilmezse (undefined) tenant'in varsayilan sablonu otomatik atanir (yoksa null);
   * `null` verilirse sablon acikca kaldirilir; bir id verilirse tenant'a ait olmasi
   * dogrulanir. */
  private async resolveTemplateId(
    tx: Pick<TenantPrismaClient, 'quoteTemplate'>,
    templateId: string | null | undefined,
  ): Promise<string | null> {
    if (templateId === undefined) {
      const defaultTemplate = await tx.quoteTemplate.findFirst({
        where: { isDefault: true },
      });
      return defaultTemplate?.id ?? null;
    }
    if (templateId === null) {
      return null;
    }
    const template = await tx.quoteTemplate.findFirst({
      where: { id: templateId },
    });
    if (!template) {
      throw new AppException(
        'QUOTE_TEMPLATE_NOT_FOUND',
        'Secilen teklif sablonu bulunamadi.',
        HttpStatus.BAD_REQUEST,
      );
    }
    return template.id;
  }

  /**
   * Q3/Q4/Q5/Q7: satir basina birim fiyati (Product.price ya da manuel ezme) ve
   * iskonto notunu belirler, ayrica ProductDiscountPolicy (Product.maxDiscountPct)
   * asimi olup olmadigini doner - bkz. docs/VARSAYIMLAR.md V27/V37.
   */
  private async resolveItems(
    tx: ItemResolutionTx,
    items: QuoteItemInputDto[],
  ): Promise<{ items: ResolvedQuoteItem[]; requiresApproval: boolean }> {
    const productIds = [...new Set(items.map((item) => item.productId))];
    const products = await tx.product.findMany({
      where: { id: { in: productIds } },
    });
    const productById = new Map(products.map((p) => [p.id, p]));

    const missingItem = items.find((item) => !productById.has(item.productId));
    if (missingItem) {
      throw new AppException(
        'PRODUCT_NOT_FOUND',
        'Secilen urunlerden biri bulunamadi.',
        HttpStatus.BAD_REQUEST,
      );
    }

    let requiresApproval = false;
    const resolved = items.map((item): ResolvedQuoteItem => {
      const product = productById.get(item.productId)!;
      const unitPrice = item.unitPrice ?? product.price ?? undefined;
      if (unitPrice === undefined) {
        throw new AppException(
          'PRICE_NOT_FOUND',
          `"${product.name}" urununde tanimli bir fiyat yok, lutfen birim fiyat girin.`,
          HttpStatus.BAD_REQUEST,
        );
      }
      const maxDiscountPct = product.maxDiscountPct
        ? Number(product.maxDiscountPct)
        : null;
      if (maxDiscountPct !== null && item.discountPct > maxDiscountPct) {
        requiresApproval = true;
      }
      return {
        productId: item.productId,
        quantity: item.quantity,
        unitPrice,
        currency: product.currency,
        discountPct: item.discountPct,
        vatPct: item.vatPct,
        discountNote:
          item.discountPct > 0
            ? `Iskonto uygulandi: %${item.discountPct}`
            : null,
        costPriceAtSale: product.avgCost,
      };
    });

    return { items: resolved, requiresApproval };
  }

  /** Ad-hoc revizyon takibi: kaydedilmeden ONCE `existing`in kalemlerini/kurunu
   * frontend'in mevcut quote-totals.ts hesaplayicilarina dogrudan verilebilecek
   * sekilde donduruen snapshot (bkz. Quote.revisionSnapshot doc comment'i). */
  private buildRevisionSnapshot(
    quote: QuoteWithDetails,
  ): QuoteRevisionSnapshot {
    return {
      items: quote.items.map((item) => ({
        productName: item.product.name,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        currency: item.currency,
        discountPct: Number(item.discountPct),
        vatPct: Number(item.vatPct),
      })),
      quoteCurrency: quote.quoteCurrency,
      exchangeRates: quote.exchangeRates as {
        asOf?: string;
        rates: Record<string, number>;
      } | null,
    };
  }

  /** /teklifler/:id "Durum" sekmesi icin append-only gecmis satiri (bkz.
   * QuoteStatusHistory doc comment'i) - her gercek durum degisiminde cagrilir. */
  private async recordStatusHistory(
    tx: StatusHistoryTx,
    params: {
      quoteId: string;
      status: Quote['status'];
      createdById: string;
      reason?: string | null;
      note?: string | null;
    },
  ): Promise<void> {
    await tx.quoteStatusHistory.create({
      data: {
        quoteId: params.quoteId,
        status: params.status,
        reason: params.reason ?? null,
        note: params.note ?? null,
        createdById: params.createdById,
      } as never,
    });
  }

  /** /teklifler/:id "Durum" sekmesi: bu teklife ait tum durum gecmisi, en eskiden en
   * yeniye sirali, kullanici adlari coz ulmus halde. Ozellik eklenmeden once
   * olusturulmus tekliflerin gecmisi yoktur - bu durumda frontend Quote.createdAt'ten
   * tek bir "Olusturuldu" satiri sentezler, bu metod bos dizi doner. */
  async getStatusHistory(id: string): Promise<QuoteStatusHistoryEntry[]> {
    await this.getById(id);
    const rows = await this.prisma.quoteStatusHistory.findMany({
      where: { quoteId: id },
      orderBy: { createdAt: 'asc' },
    });
    const userIds = [...new Set(rows.map((row) => row.createdById))];
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true },
    });
    const nameById = new Map(users.map((user) => [user.id, user.name]));
    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      reason: row.reason,
      note: row.note,
      createdAt: row.createdAt,
      createdByName: nameById.get(row.createdById) ?? null,
    }));
  }

  /** /teklifler?tab=reports "Reddedilme Sebepleri" pasta grafigi: tenant'ta REJECTED
   * durumundaki her teklif, en son REJECTED durum gecmisi satirinin secilen sebebine
   * (bkz. QuoteStatusHistory.reason, reject()/update() akislarinda artik zorunlu secim)
   * gruplanir. Sebebi olmayan (bu alan eklenmeden once reddedilmis) tekliflerin sayisi
   * `reason: null` ile tek bir grupta doner, frontend bunu "Belirtilmemiş" olarak gosterir. */
  async getRejectionReasonsSummary(): Promise<
    { reason: string | null; count: number }[]
  > {
    const rejectedQuotes = await this.prisma.quote.findMany({
      where: { status: 'REJECTED' },
      select: { id: true },
    });
    if (rejectedQuotes.length === 0) {
      return [];
    }
    const quoteIds = rejectedQuotes.map((quote) => quote.id);
    const historyRows = await this.prisma.quoteStatusHistory.findMany({
      where: { quoteId: { in: quoteIds }, status: 'REJECTED' },
      orderBy: { createdAt: 'asc' },
    });
    const latestReasonByQuoteId = new Map<string, string | null>();
    for (const row of historyRows) {
      latestReasonByQuoteId.set(row.quoteId, row.reason);
    }
    const countByReason = new Map<string | null, number>();
    for (const quoteId of quoteIds) {
      const reason = latestReasonByQuoteId.get(quoteId) ?? null;
      countByReason.set(reason, (countByReason.get(reason) ?? 0) + 1);
    }
    return [...countByReason.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count);
  }

  /** /teklifler/:id "Stok Kontrolu" sekmesi: teklifteki her urun icin tenant'in tum
   * depolarindaki mevcut miktar. MANUAL_TOTAL modundaki tekliflerde (bkz. itemsEntryMode)
   * items bos oldugundan dolu bir sonuc donmez - bu beklenen bir durum, hata degil. */
  async getStockCheck(id: string): Promise<QuoteStockCheckResult> {
    const quote = await this.getById(id);
    const warehouses = await this.prisma.warehouse.findMany({
      orderBy: { name: 'asc' },
    });
    const productIds = [...new Set(quote.items.map((item) => item.productId))];
    const stockByProduct =
      await this.stockItems.getStockByProductIds(productIds);
    const items: QuoteStockCheckRow[] = quote.items.map((item) => {
      const breakdown = stockByProduct.get(item.productId) ?? [];
      const stockByWarehouseId: Record<string, number> = {};
      for (const entry of breakdown) {
        stockByWarehouseId[entry.warehouseId] = entry.quantity.toNumber();
      }
      const totalStock = breakdown.reduce(
        (sum, entry) => sum + entry.quantity.toNumber(),
        0,
      );
      return {
        productId: item.productId,
        productName: item.product.name,
        productSku: item.product.sku,
        unit: item.product.unit,
        quoteQuantity: item.quantity.toNumber(),
        stockByWarehouseId,
        totalStock,
      };
    });
    return {
      warehouses: warehouses.map((w) => ({ id: w.id, name: w.name })),
      items,
    };
  }

  /** /teklifler/yeni'deki firma bazli uyari icin ("Bu firma daha once N kere
   * revize istedi") - bir firmanin tum tekliflerindeki revisionCount toplami. */
  async getRevisionSummaryForAccount(
    accountId: string,
  ): Promise<{ count: number }> {
    const result = await this.prisma.quote.aggregate({
      where: { accountId },
      _sum: { revisionCount: true },
    });
    return { count: result._sum.revisionCount ?? 0 };
  }

  /** createdById iliskisel bir FK degil (bkz. schema); isim gostermek icin
   * User tablosundan toplu cozumleniyor (interactions.service.ts'teki ayni desen). */
  private async attachCreatedByNames(
    rows: QuoteRow[],
  ): Promise<QuoteWithDetails[]> {
    const ids = [...new Set(rows.map((row) => row.createdById))];
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    const nameById = new Map(users.map((user) => [user.id, user.name]));
    return rows.map((row) => ({
      ...row,
      createdByName: nameById.get(row.createdById) ?? null,
    }));
  }

  async list(query: QuoteQueryDto): Promise<PagedResult<QuoteWithDetails>> {
    const cached = await this.quotesCache.get(query);
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
    // Turkce aksanli karakterlerde (Ü, Ö, Ş, Ç, İ/ı) yanlis sonuc veriyor - bkz.
    // core/db/turkish-search.ts. createdById iliskisel bir FK degil, bu yuzden
    // "olusturan" adina gore arama icin users'a createdById uzerinden JOIN yapiliyor.
    const matchingIds = q
      ? await findIdsBySql(
          this.prisma,
          Prisma.sql`
            SELECT qt."id" FROM "crm_quotes" qt
            LEFT JOIN "crm_accounts" a ON a."id" = qt."accountId"
            LEFT JOIN "users" u ON u."id" = qt."createdById"
            WHERE qt."tenantId" = ${TenantContext.getOrThrow().tenantId}
              AND qt."deletedAt" IS NULL
              AND (
                ${turkishContains(qualifiedColumn('qt', 'title'), q)}
                OR ${turkishContains(qualifiedColumn('qt', 'quoteNumber'), q)}
                OR ${turkishContains(qualifiedColumn('a', 'name'), q)}
                OR ${turkishContains(qualifiedColumn('u', 'name'), q)}
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
            quoteDate: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.quote.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { [field]: direction },
        include: QUOTE_INCLUDE,
      }),
      this.prisma.quote.count({ where }),
    ]);

    const result = {
      data: await this.attachCreatedByNames(data),
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
    await this.quotesCache.set(query, result);
    return result;
  }

  async getById(id: string): Promise<QuoteWithDetails> {
    const quote = await this.prisma.quote.findFirst({
      where: { id },
      include: QUOTE_INCLUDE,
    });
    if (!quote) {
      throw new AppException(
        'NOT_FOUND',
        'Teklif bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    const [withName] = await this.attachCreatedByNames([quote]);
    return withName;
  }

  /** Ad-hoc: markali PDF yazdirma sayfasinin (quote-template-print-page.tsx) tek
   * seferde ihtiyac duydugu tum veri - sablonun gorsel URL'leri dahil (bkz.
   * docs/VARSAYIMLAR.md V41). Banka hesabi/kosul metni sablon duzeyinde
   * TUTULMAZ - bunlar zaten teklifin kendi alanlaridir (Quote.ibanNumber vb.,
   * Quote.salesTerms, Quote.deliveryTerms), QUOTE_INCLUDE ile gelen
   * `quote.template` uzerinde ek sorguya gerek yok. templateId yoksa
   * `template: null` doner. */
  async getPrintData(id: string): Promise<QuotePrintData> {
    const quote = await this.getById(id);
    const { tenantId } = TenantContext.getOrThrow();
    const [tenant, sender] = await Promise.all([
      this.prisma.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        select: { name: true, address: true, phone: true, email: true },
      }),
      this.prisma.user.findFirst({
        where: { id: quote.senderId ?? quote.createdById },
        select: { name: true, title: true, phone: true, email: true },
      }),
    ]);
    const company: QuotePrintCompanyData = {
      name: tenant.name,
      address: tenant.address,
      phone: tenant.phone,
      email: tenant.email,
    };
    const template = quote.template;
    if (!template) {
      return { ...quote, template: null, company, sender };
    }
    return {
      ...quote,
      company,
      sender,
      template: {
        id: template.id,
        name: template.name,
        logoUrl: this.fileUrl.build(template.logoKey, template.updatedAt),
        coverImageUrl: this.fileUrl.build(
          template.coverImageKey,
          template.updatedAt,
        ),
        closingImageUrl: this.fileUrl.build(
          template.closingImageKey,
          template.updatedAt,
        ),
        companyDisplayName: template.companyDisplayName,
        companyTagline: template.companyTagline,
      },
    };
  }

  /**
   * /teklifler/yeni ve /teklifler/duzenle/:id'deki "Gonderen" secicisi icin
   * secilebilir kullanici listesi - ProjectsService.listAssignableUsers ile
   * ayni filtre (aktif, platform admin olmayan kullanicilar), ama PDF'te
   * gosterilecek unvan/telefon/eposta de dahil.
   */
  async listAssignableUsers(): Promise<
    {
      id: string;
      name: string;
      title: string | null;
      phone: string | null;
      email: string;
    }[]
  > {
    return this.prisma.user.findMany({
      where: { isActive: true, isPlatformAdmin: false },
      select: { id: true, name: true, title: true, phone: true, email: true },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Gunluk sira sayacinin taban sorgusu. `tx.quote.count()` yerine ham SQL
   * kullaniyor: tenant-scoped extension SOFT_DELETE_MODELS icin okuma
   * sorgularina otomatik `deletedAt: null` ekliyor, ama `quoteNumber` unique
   * kisiti (`@@unique([tenantId, quoteNumber])`) soft-delete'li satirlari da
   * kapsiyor. Silinmis bir teklif ayni gun-ici numarayi hala isgal ediyorken
   * sayac onu gormezden gelip ayni numarayi tekrar uretirse `P2002` olusur -
   * bu yuzden burada silinmisler dahil TUM satirlar sayilmali (bkz. sohbet
   * gecmisi: kullanici tum teklifleri sildikten sonra bu hatayla karsilasti).
   */
  private async countQuoteNumbersForPrefix(
    tx: Pick<TenantPrismaClient, '$queryRaw'>,
    prefix: string,
  ): Promise<number> {
    const { tenantId } = TenantContext.getOrThrow();
    const rows = await tx.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count
      FROM crm_quotes
      WHERE "tenantId" = ${tenantId}
        AND "quoteNumber" LIKE ${prefix + '%'}
    `;
    return Number(rows[0]?.count ?? 0);
  }

  async create(
    createdById: string,
    dto: CreateQuoteDto,
  ): Promise<QuoteWithDetails> {
    await this.assertValidPaymentMethod(dto.paymentMethod);
    const ibanSnapshot = await this.resolveIbanSnapshot(dto.ibanOptionId);
    const sender = await this.prisma.user.findFirst({
      where: { id: dto.senderId },
    });
    if (!sender) {
      throw new AppException(
        'SENDER_NOT_FOUND',
        'Secilen gonderen bulunamadi.',
        HttpStatus.BAD_REQUEST,
      );
    }

    /**
     * `P2002` (quoteNumber cakismasi) gercek bir Postgres hatasidir; ayni
     * transaction icinde tekrar denemek `25P02 current transaction is
     * aborted` ile sonuclanir (Postgres, SAVEPOINT olmadan hatali bir
     * statement'tan sonraki komutlari transaction rollback edilene kadar
     * reddeder). Bu yuzden her deneme kendi TAZE transaction'inda yapilir.
     */
    let quoteId: string | undefined;
    for (let attempt = 0; attempt < QUOTE_NUMBER_CREATE_RETRIES; attempt += 1) {
      try {
        quoteId = await this.prisma.$transaction(async (tx) => {
          const account = await tx.account.findFirst({
            where: { id: dto.accountId },
          });
          if (!account) {
            throw new AppException(
              'ACCOUNT_NOT_FOUND',
              'Secilen firma bulunamadi.',
              HttpStatus.BAD_REQUEST,
            );
          }

          if (dto.contactId) {
            const contact = await tx.contact.findFirst({
              where: { id: dto.contactId },
            });
            if (!contact || contact.accountId !== dto.accountId) {
              throw new AppException(
                'CONTACT_ACCOUNT_MISMATCH',
                'Secilen kisi bu firmaya ait degil.',
                HttpStatus.BAD_REQUEST,
              );
            }
          }

          const { items } = await this.resolveItems(tx, dto.items);
          this.assertExchangeRatesCoverItems(
            dto.quoteCurrency,
            items,
            dto.exchangeRates,
          );
          const templateId = await this.resolveTemplateId(tx, dto.templateId);

          const prefix = quoteNumberPrefix(new Date());
          const countToday = await this.countQuoteNumbersForPrefix(tx, prefix);
          const quoteNumber = `${prefix}${String(countToday + 1).padStart(3, '0')}`;

          const created = await tx.quote.create({
            data: {
              accountId: dto.accountId,
              contactId: dto.contactId ?? null,
              quoteNumber,
              quoteDate: dto.quoteDate,
              leadTime: dto.leadTime ?? null,
              paymentMethod: dto.paymentMethod ?? null,
              title: dto.title ?? null,
              paymentTerms: dto.paymentTerms ?? null,
              salesTerms: dto.salesTerms ?? null,
              deliveryTerms: dto.deliveryTerms ?? null,
              generalTerms: dto.generalTerms ?? null,
              ...ibanSnapshot,
              templateId,
              status: 'DRAFT',
              senderId: dto.senderId,
              createdById,
              quoteCurrency: dto.quoteCurrency,
              exchangeRates: dto.exchangeRates ?? undefined,
              items: { create: items },
            } as never,
          });

          if (dto.opportunity) {
            await tx.opportunity.create({
              data: {
                accountId: dto.accountId,
                quoteId: created.id,
                name: dto.opportunity.name,
                stage: dto.opportunity.stage,
                estimatedValue: dto.opportunity.estimatedValue,
                createdById,
              } as never,
            });
          }

          await this.recordStatusHistory(tx, {
            quoteId: created.id,
            status: 'DRAFT',
            createdById,
          });

          return created.id;
        });
        break;
      } catch (error) {
        const isDuplicateNumber =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002';
        if (!isDuplicateNumber) {
          throw error;
        }
      }
    }
    if (!quoteId) {
      throw new AppException(
        'QUOTE_NUMBER_CONFLICT',
        'Teklif numarasi olusturulamadi, lutfen tekrar deneyin.',
        HttpStatus.CONFLICT,
      );
    }

    await this.audit.log({
      action: 'CREATE',
      entity: 'Quote',
      entityId: quoteId,
    });
    await this.quotesCache.invalidate();
    if (dto.opportunity) {
      await this.opportunitiesCache.invalidate();
    }
    return this.getById(quoteId);
  }

  /**
   * Bir teklif REVIZE durumuna cekildiginde (durum dropdown'u /teklifler'de veya
   * /teklifler/:id detayinda) tenant'taki TUM aktif kullanicilara bildirim gider -
   * CheckContactInactivityProcessor.notify ile ayni "tenant genelinde yayin"
   * deseni (bkz. NotificationType.QUOTE_REVISION_REQUESTED doc comment'i).
   */
  private async notifyQuoteRevision(
    quote: QuoteWithDetails,
    actingUserId: string,
  ): Promise<void> {
    const { tenantId } = TenantContext.getOrThrow();
    const [actingUser, recipients] = await Promise.all([
      this.prisma.user.findFirst({ where: { id: actingUserId } }),
      this.prisma.user.findMany({
        where: { isActive: true },
        select: { id: true },
      }),
    ]);
    const actorName = actingUser?.name ?? 'Bir kullanici';
    const title = `${actorName}, "${quote.quoteNumber}" numarali teklifi (${quote.account.name}) revize moduna aldi.`;

    await Promise.all(
      recipients.map((recipient) =>
        this.notifications.create(tenantId, {
          recipientUserId: recipient.id,
          type: 'QUOTE_REVISION_REQUESTED',
          title,
          relatedEntityType: 'Quote',
          relatedEntityId: quote.id,
          createdById: actingUserId,
        }),
      ),
    );
  }

  /**
   * `dto.status` verilirse /teklifler listesindeki durum dropdown'undan gelen
   * dogrudan durum degisikligi uygulanir (APPROVED'a gecis S1/ensurePostSaleCase'i
   * tetikler, dedicated approve() ucuyla ayni davranis).
   */
  async update(
    id: string,
    dto: UpdateQuoteDto,
    actingUserId: string,
  ): Promise<QuoteWithDetails> {
    const existing = await this.getById(id);
    if (existing.status === 'APPROVED' || existing.status === 'REJECTED') {
      throw new AppException(
        'QUOTE_NOT_EDITABLE',
        'Onaylanmis veya reddedilmis teklifler duzenlenemez.',
        HttpStatus.CONFLICT,
      );
    }
    /**
     * Ad-hoc revizyon takibi: teklif REVIZE durumundayken kalemler kaydedilirse
     * (fiyat revizyonu) revizyon notu zorunludur - eski kalemler/kur, kaydetmeden
     * ONCE `existing`ten (henuz degismemis haliyle) snapshot'lanir.
     */
    const isRevisionSave =
      existing.status === 'REVIZE' && dto.items !== undefined;
    /** Teklif bu update ile ilk kez REVIZE durumuna cekiliyorsa (durum
     * dropdown'undan, isRevisionSave'den ayri - o zaten REVIZE'deyken kalem
     * kaydini konu alir), tum aktif kullanicilara bildirim gider. */
    const enteredRevision =
      dto.status === 'REVIZE' && existing.status !== 'REVIZE';
    if (isRevisionSave && !dto.revisionNote) {
      throw new AppException(
        'REVISION_NOTE_REQUIRED',
        'Revize notu zorunludur.',
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.assertValidPaymentMethod(dto.paymentMethod ?? undefined);
    if (dto.senderId !== undefined) {
      const sender = await this.prisma.user.findFirst({
        where: { id: dto.senderId },
      });
      if (!sender) {
        throw new AppException(
          'SENDER_NOT_FOUND',
          'Secilen gonderen bulunamadi.',
          HttpStatus.BAD_REQUEST,
        );
      }
    }
    const ibanOptionIdProvided = dto.ibanOptionId !== undefined;
    const ibanSnapshot = ibanOptionIdProvided
      ? await this.resolveIbanSnapshot(dto.ibanOptionId)
      : null;

    const contactIdProvided = dto.contactId !== undefined;
    const contactUpdateData = {
      ...(contactIdProvided ? { contactId: dto.contactId ?? null } : {}),
      ...(dto.quoteDate !== undefined ? { quoteDate: dto.quoteDate } : {}),
      ...(dto.leadTime !== undefined ? { leadTime: dto.leadTime ?? null } : {}),
      ...(dto.paymentMethod !== undefined
        ? { paymentMethod: dto.paymentMethod ?? null }
        : {}),
      ...(dto.title !== undefined ? { title: dto.title ?? null } : {}),
      ...(dto.paymentTerms !== undefined
        ? { paymentTerms: dto.paymentTerms ?? null }
        : {}),
      ...(dto.salesTerms !== undefined
        ? { salesTerms: dto.salesTerms ?? null }
        : {}),
      ...(dto.deliveryTerms !== undefined
        ? { deliveryTerms: dto.deliveryTerms ?? null }
        : {}),
      ...(dto.generalTerms !== undefined
        ? { generalTerms: dto.generalTerms ?? null }
        : {}),
      ...(ibanSnapshot ?? {}),
      ...(dto.quoteCurrency !== undefined
        ? { quoteCurrency: dto.quoteCurrency }
        : {}),
      ...(dto.exchangeRates !== undefined
        ? { exchangeRates: dto.exchangeRates }
        : {}),
      ...(dto.senderId !== undefined ? { senderId: dto.senderId } : {}),
      ...(isRevisionSave
        ? {
            revisionNote: dto.revisionNote,
            revisionSnapshot: this.buildRevisionSnapshot(
              existing,
            ) as unknown as Prisma.InputJsonValue,
            revisionCount: existing.revisionCount + 1,
            lastRevisedAt: new Date(),
          }
        : {}),
    };
    const templateIdProvided = dto.templateId !== undefined;
    const hasFieldUpdates =
      Object.keys(contactUpdateData).length > 0 || templateIdProvided;

    const postSaleCase = await this.prisma.$transaction(async (tx) => {
      if (contactIdProvided && dto.contactId) {
        const contact = await tx.contact.findFirst({
          where: { id: dto.contactId },
        });
        if (!contact || contact.accountId !== existing.accountId) {
          throw new AppException(
            'CONTACT_ACCOUNT_MISMATCH',
            'Secilen kisi bu firmaya ait degil.',
            HttpStatus.BAD_REQUEST,
          );
        }
      }

      if (templateIdProvided) {
        const templateId = await this.resolveTemplateId(tx, dto.templateId);
        (contactUpdateData as Record<string, unknown>).templateId = templateId;
      }

      const finalQuoteCurrency = dto.quoteCurrency ?? existing.quoteCurrency;
      if (dto.items) {
        const { items } = await this.resolveItems(tx, dto.items);
        this.assertExchangeRatesCoverItems(
          finalQuoteCurrency,
          items,
          dto.exchangeRates,
        );
        await tx.quoteItem.deleteMany({ where: { quoteId: id } });
        await tx.quoteItem.createMany({
          data: items.map((item) => ({ ...item, quoteId: id })),
        });
      } else if (dto.quoteCurrency !== undefined) {
        this.assertExchangeRatesCoverItems(
          finalQuoteCurrency,
          existing.items,
          dto.exchangeRates ??
            (existing.exchangeRates as unknown as QuoteExchangeRatesDto | null) ??
            undefined,
        );
      }

      const nextStatus = dto.status ?? existing.status;
      if (nextStatus === existing.status) {
        if (hasFieldUpdates) {
          await tx.quote.update({ where: { id }, data: contactUpdateData });
        }
        if (isRevisionSave) {
          // Durum zaten REVIZE'de kaliyor (dto.status gonderilmedi), ama bu kayit
          // asil revizyon notunu tasiyor - "Durum" sekmesinde gorunmesi icin ayrica
          // bir status history satiri acilmali, aksi halde not sadece
          // Quote.revisionNote'ta kalip "Durum" sekmesine hic yazilmaz.
          await this.recordStatusHistory(tx, {
            quoteId: id,
            status: 'REVIZE',
            createdById: actingUserId,
            note: dto.revisionNote ?? null,
          });
        }
        return null;
      }

      if (nextStatus === 'APPROVED') {
        const approvedAt = new Date();
        await tx.quote.update({
          where: { id },
          data: {
            status: 'APPROVED',
            approvedAt,
            approvedById: actingUserId,
            ...contactUpdateData,
          },
        });
        // dto.warehouseId burada kesinlikle dolu: UpdateQuoteSchema.refine
        // status==='APPROVED' oldugunda bunu zorunlu kilar.
        await this.ensureStockDecreaseForQuote(tx, {
          quoteId: id,
          quoteNumber: existing.quoteNumber,
          warehouseId: dto.warehouseId as string,
          items: existing.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
          })),
        });
        await this.recordStatusHistory(tx, {
          quoteId: id,
          status: 'APPROVED',
          createdById: actingUserId,
        });
        return this.ensurePostSaleCase(tx, {
          quoteId: id,
          accountId: existing.accountId,
          contactId: contactIdProvided
            ? (dto.contactId ?? null)
            : existing.contactId,
          approvedAt,
        });
      }

      if (nextStatus === 'REJECTED') {
        await tx.quote.update({
          where: { id },
          data: {
            status: 'REJECTED',
            approvedAt: new Date(),
            approvedById: actingUserId,
            ...contactUpdateData,
          },
        });
        await this.recordStatusHistory(tx, {
          quoteId: id,
          status: 'REJECTED',
          createdById: actingUserId,
          // dto.rejectionReason burada kesinlikle dolu: UpdateQuoteSchema.refine
          // status==='REJECTED' oldugunda bunu zorunlu kilar (bkz. ApproveQuoteSchema/
          // warehouseId ile ayni desen).
          reason: dto.rejectionReason as string,
          note: dto.rejectionNote ?? null,
        });
        return null;
      }

      await tx.quote.update({
        where: { id },
        data: { status: nextStatus, ...contactUpdateData },
      });
      await this.recordStatusHistory(tx, {
        quoteId: id,
        status: nextStatus,
        createdById: actingUserId,
        note: nextStatus === 'REVIZE' ? (dto.revisionNote ?? null) : null,
      });
      return null;
    });

    await this.audit.log({ action: 'UPDATE', entity: 'Quote', entityId: id });
    await this.quotesCache.invalidate();
    if (postSaleCase) {
      await this.postSaleCasesCache.invalidate();
      await this.productsCache.invalidate();
    }
    if (postSaleCase?.contactId) {
      await this.surveyQueue.add(SEND_POST_SALE_SURVEY_JOB, {
        postSaleCaseId: postSaleCase.id,
      });
    }
    if (enteredRevision) {
      await this.notifyQuoteRevision(existing, actingUserId);
    }
    return this.getById(id);
  }

  async remove(id: string): Promise<void> {
    await this.getById(id);
    await this.prisma.quote.delete({ where: { id } });
    await this.audit.log({ action: 'DELETE', entity: 'Quote', entityId: id });
    await this.quotesCache.invalidate();
  }

  /** Q7: sadece onay bekleyen teklifler onaylanabilir/reddedilebilir. */
  private async assertPendingApproval(id: string): Promise<QuoteWithDetails> {
    const quote = await this.getById(id);
    if (quote.status !== 'PENDING_APPROVAL') {
      throw new AppException(
        'QUOTE_NOT_PENDING',
        'Sadece onay bekleyen teklifler bu islemi yapabilir.',
        HttpStatus.CONFLICT,
      );
    }
    return quote;
  }

  async approve(
    id: string,
    approvedById: string,
    dto: ApproveQuoteDto,
  ): Promise<QuoteWithDetails> {
    const existing = await this.assertPendingApproval(id);
    const approvedAt = new Date();
    const postSaleCase = await this.prisma.$transaction(async (tx) => {
      await tx.quote.update({
        where: { id },
        data: { status: 'APPROVED', approvedAt, approvedById },
      });
      await this.ensureStockDecreaseForQuote(tx, {
        quoteId: id,
        quoteNumber: existing.quoteNumber,
        warehouseId: dto.warehouseId,
        items: existing.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
        })),
      });
      await this.recordStatusHistory(tx, {
        quoteId: id,
        status: 'APPROVED',
        createdById: approvedById,
      });
      return this.ensurePostSaleCase(tx, {
        quoteId: id,
        accountId: existing.accountId,
        contactId: existing.contactId,
        approvedAt,
      });
    });
    await this.audit.log({ action: 'APPROVE', entity: 'Quote', entityId: id });
    await this.quotesCache.invalidate();
    await this.postSaleCasesCache.invalidate();
    await this.productsCache.invalidate();
    if (postSaleCase.contactId) {
      await this.surveyQueue.add(SEND_POST_SALE_SURVEY_JOB, {
        postSaleCaseId: postSaleCase.id,
      });
    }
    return this.getById(id);
  }

  async reject(
    id: string,
    approvedById: string,
    dto: RejectQuoteDto,
  ): Promise<QuoteWithDetails> {
    await this.assertPendingApproval(id);
    await this.prisma.quote.update({
      where: { id },
      data: { status: 'REJECTED', approvedAt: new Date(), approvedById },
    });
    await this.recordStatusHistory(this.prisma, {
      quoteId: id,
      status: 'REJECTED',
      createdById: approvedById,
      reason: dto.reason,
      note: dto.note ?? null,
    });
    await this.audit.log({ action: 'REJECT', entity: 'Quote', entityId: id });
    await this.quotesCache.invalidate();
    return this.getById(id);
  }
}
