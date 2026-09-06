import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  Account,
  Opportunity,
  PriceList,
  Product,
  Quote,
  QuoteItem,
} from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import { parseSort, type PagedResult } from '../../core/dto/list-query.dto';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { AuditService } from '../audit/audit.service';
import type {
  CreateQuoteDto,
  QuoteItemInputDto,
  QuoteQueryDto,
  UpdateQuoteDto,
} from './dto/quote.dto';

const SORTABLE_FIELDS = ['quoteNumber', 'createdAt'] as const;
const QUOTE_NUMBER_CREATE_RETRIES = 5;

const QUOTE_INCLUDE = {
  account: true,
  priceList: true,
  opportunity: true,
  items: { include: { product: true } },
} as const;

export type QuoteWithDetails = Quote & {
  account: Account;
  priceList: PriceList;
  opportunity: Opportunity | null;
  items: (QuoteItem & { product: Product })[];
};

interface ResolvedQuoteItem {
  productId: string;
  quantity: number;
  unitPrice: number | Prisma.Decimal;
  discountPct: number;
  vatPct: number;
  discountNote: string | null;
}

type ItemResolutionTx = Pick<TenantPrismaClient, 'product' | 'priceListItem'>;

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
  ) {}

  /**
   * Q3/Q4/Q5/Q7: satir basina birim fiyati (fiyat listesi ya da manuel ezme) ve
   * iskonto notunu belirler, ayrica ProductDiscountPolicy (Product.maxDiscountPct)
   * asimi olup olmadigini doner - bkz. docs/VARSAYIMLAR.md V27.
   */
  private async resolveItems(
    tx: ItemResolutionTx,
    priceListId: string,
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

    const needsPriceLookup = items.some((item) => item.unitPrice === undefined);
    const priceListItems = needsPriceLookup
      ? await tx.priceListItem.findMany({
          where: { priceListId, productId: { in: productIds } },
        })
      : [];
    const priceByProduct = new Map(
      priceListItems.map((pli) => [pli.productId, pli.unitPrice]),
    );

    let requiresApproval = false;
    const resolved = items.map((item): ResolvedQuoteItem => {
      const product = productById.get(item.productId)!;
      const unitPrice = item.unitPrice ?? priceByProduct.get(item.productId);
      if (unitPrice === undefined) {
        throw new AppException(
          'PRICE_NOT_FOUND',
          `"${product.name}" urunu secilen fiyat listesinde tanimli degil, lutfen birim fiyat girin.`,
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
        discountPct: item.discountPct,
        vatPct: item.vatPct,
        discountNote:
          item.discountPct > 0
            ? `Iskonto uygulandi: %${item.discountPct}`
            : null,
      };
    });

    return { items: resolved, requiresApproval };
  }

  async list(query: QuoteQueryDto): Promise<PagedResult<QuoteWithDetails>> {
    const { page, pageSize, accountId, status } = query;
    const { field, direction } = parseSort(query.sort, SORTABLE_FIELDS, {
      field: 'createdAt',
      direction: 'desc',
    });

    const where = {
      ...(accountId ? { accountId } : {}),
      ...(status ? { status } : {}),
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

    return {
      data,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
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
    return quote;
  }

  async create(
    createdById: string,
    dto: CreateQuoteDto,
  ): Promise<QuoteWithDetails> {
    const quoteId = await this.prisma.$transaction(async (tx) => {
      const { items, requiresApproval } = await this.resolveItems(
        tx,
        dto.priceListId,
        dto.items,
      );

      let created: Quote | undefined;
      for (
        let attempt = 0;
        attempt < QUOTE_NUMBER_CREATE_RETRIES;
        attempt += 1
      ) {
        const prefix = quoteNumberPrefix(new Date());
        const countToday = await tx.quote.count({
          where: { quoteNumber: { startsWith: prefix } },
        });
        const quoteNumber = `${prefix}${String(countToday + 1).padStart(3, '0')}`;
        try {
          created = await tx.quote.create({
            data: {
              accountId: dto.accountId,
              priceListId: dto.priceListId,
              quoteNumber,
              status: requiresApproval ? 'PENDING_APPROVAL' : 'APPROVED',
              createdById,
              items: { create: items },
            } as never,
          });
          break;
        } catch (error) {
          const isDuplicateNumber =
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2002';
          if (
            !isDuplicateNumber ||
            attempt === QUOTE_NUMBER_CREATE_RETRIES - 1
          ) {
            throw error;
          }
        }
      }
      if (!created) {
        throw new AppException(
          'QUOTE_NUMBER_CONFLICT',
          'Teklif numarasi olusturulamadi, lutfen tekrar deneyin.',
          HttpStatus.CONFLICT,
        );
      }

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

      return created.id;
    });

    await this.audit.log({
      action: 'CREATE',
      entity: 'Quote',
      entityId: quoteId,
    });
    return this.getById(quoteId);
  }

  async update(id: string, dto: UpdateQuoteDto): Promise<QuoteWithDetails> {
    const existing = await this.getById(id);
    if (existing.status === 'APPROVED' || existing.status === 'REJECTED') {
      throw new AppException(
        'QUOTE_NOT_EDITABLE',
        'Onaylanmis veya reddedilmis teklifler duzenlenemez.',
        HttpStatus.CONFLICT,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const priceListId = dto.priceListId ?? existing.priceListId;

      if (dto.items) {
        const { items, requiresApproval } = await this.resolveItems(
          tx,
          priceListId,
          dto.items,
        );
        await tx.quoteItem.deleteMany({ where: { quoteId: id } });
        await tx.quoteItem.createMany({
          data: items.map((item) => ({ ...item, quoteId: id })),
        });
        await tx.quote.update({
          where: { id },
          data: {
            priceListId,
            status: requiresApproval ? 'PENDING_APPROVAL' : 'APPROVED',
          },
        });
      } else if (dto.priceListId) {
        await tx.quote.update({
          where: { id },
          data: { priceListId: dto.priceListId },
        });
      }
    });

    await this.audit.log({ action: 'UPDATE', entity: 'Quote', entityId: id });
    return this.getById(id);
  }

  async remove(id: string): Promise<void> {
    await this.getById(id);
    await this.prisma.quote.delete({ where: { id } });
    await this.audit.log({ action: 'DELETE', entity: 'Quote', entityId: id });
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

  async approve(id: string, approvedById: string): Promise<QuoteWithDetails> {
    await this.assertPendingApproval(id);
    await this.prisma.quote.update({
      where: { id },
      data: { status: 'APPROVED', approvedAt: new Date(), approvedById },
    });
    await this.audit.log({ action: 'APPROVE', entity: 'Quote', entityId: id });
    return this.getById(id);
  }

  async reject(id: string, approvedById: string): Promise<QuoteWithDetails> {
    await this.assertPendingApproval(id);
    await this.prisma.quote.update({
      where: { id },
      data: { status: 'REJECTED', approvedAt: new Date(), approvedById },
    });
    await this.audit.log({ action: 'REJECT', entity: 'Quote', entityId: id });
    return this.getById(id);
  }
}
