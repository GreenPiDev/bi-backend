import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { DataSourceType } from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { formatImportZodIssues } from '../../core/validators/import-row-errors';
import { AuditService } from '../audit/audit.service';
import { FileParserService } from '../datasources/file-parser.service';
import { ProductListsService } from '../product-lists/product-lists.service';
import { ProductsCacheService } from '../products/products-cache.service';
import {
  QUOTE_ITEM_IMPORT_FIELD_LABELS,
  buildImportedProductListName,
  QuoteItemImportRowSchema,
  mapQuoteItemImportCells,
  validateQuoteItemImportHeaders,
  type QuoteItemImportLine,
  type QuoteItemImportResult,
  type QuoteItemImportRow,
  type QuoteItemImportRowError,
} from './quote-item-import.format';

export type { QuoteItemImportResult } from './quote-item-import.format';

const DEFAULT_UNIT_FALLBACK = 'adet';

interface ResolvedRow {
  row: QuoteItemImportRow;
  unit: string;
}

interface ProductRef {
  id: string;
  name: string;
  sku: string | null;
  brand: string | null;
  productListId: string;
}

function normalizeKey(value: string): string {
  return value.trim().toLocaleLowerCase('tr-TR');
}

@Injectable()
export class QuoteItemImportsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly fileParser: FileParserService,
    private readonly productLists: ProductListsService,
    private readonly productsCache: ProductsCacheService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Katı (sabit sablonlu) teklif kalemi ice aktarma - bkz. quote-item-import.format.ts.
   * Hepsi-ya-hic: tek bir satir bile hataliysa hicbir sey olusturulmaz, butun satir
   * hatalari 400 IMPORT_ROWS_INVALID ile birlikte doner. Eslestirme kurali: Urun Kodu
   * doluysa SADECE koda gore (tenant genelinde, buyuk/kucuk harf duyarsiz), bossa urun
   * adina gore. Eslesmeyen urunler tek bir yeni urun listesinde olusturulur.
   */
  async importItems(
    filePath: string,
    type: DataSourceType,
    originalFileName: string,
  ): Promise<QuoteItemImportResult> {
    const rows = await this.readAndValidate(filePath, type);

    const existing: ProductRef[] = await this.prisma.product.findMany({
      select: {
        id: true,
        name: true,
        sku: true,
        brand: true,
        productListId: true,
      },
    });
    const bySku = new Map<string, ProductRef>();
    const byName = new Map<string, ProductRef>();
    for (const product of existing) {
      if (product.sku && !bySku.has(normalizeKey(product.sku))) {
        bySku.set(normalizeKey(product.sku), product);
      }
      if (!byName.has(normalizeKey(product.name))) {
        byName.set(normalizeKey(product.name), product);
      }
    }
    const findExisting = ({ row }: ResolvedRow): ProductRef | undefined =>
      row.sku
        ? bySku.get(normalizeKey(row.sku))
        : byName.get(normalizeKey(row.name));
    // Ayni (bulunamayan) urun dosyada birden fazla satirda gecerse bir kez olusturulur.
    const newProductKey = ({ row }: ResolvedRow): string =>
      row.sku
        ? `sku:${normalizeKey(row.sku)}`
        : `name:${normalizeKey(row.name)}`;

    const unmatched = new Map<string, ResolvedRow>();
    for (const resolved of rows) {
      if (!findExisting(resolved)) {
        const key = newProductKey(resolved);
        if (!unmatched.has(key)) unmatched.set(key, resolved);
      }
    }

    let productList: { id: string; name: string } | null = null;
    const createdByKey = new Map<string, ProductRef>();
    if (unmatched.size > 0) {
      const created = await this.createProductList(
        buildImportedProductListName(originalFileName, new Date()),
        [...unmatched.entries()],
      );
      productList = created.productList;
      for (const [key, product] of created.products)
        createdByKey.set(key, product);
    }

    const items = rows.map((resolved): QuoteItemImportLine => {
      const product =
        findExisting(resolved) ?? createdByKey.get(newProductKey(resolved));
      if (!product) {
        throw new Error(
          'Imported quote item could not be resolved to a product.',
        );
      }
      const { row } = resolved;
      return {
        productId: product.id,
        productListId: product.productListId,
        quantity: row.quantity,
        unit: resolved.unit,
        unitPrice: row.unitPrice,
        currency: row.currency,
        discountPct: row.discountPct,
        vatPct: row.vatPct ?? null,
        brand: row.brand ?? product.brand ?? null,
      };
    });

    return {
      items,
      productList,
      matchedCount: rows.filter((resolved) => findExisting(resolved)).length,
      createdProductCount: createdByKey.size,
    };
  }

  private async readAndValidate(
    filePath: string,
    type: DataSourceType,
  ): Promise<ResolvedRow[]> {
    const parsed = await this.fileParser.parse(filePath, type, 0);
    const headerError = validateQuoteItemImportHeaders(parsed.headers);
    if (headerError) {
      throw new AppException(
        'INVALID_TEMPLATE',
        headerError,
        HttpStatus.BAD_REQUEST,
      );
    }

    const unitOptions = await this.prisma.unitOption.findMany({
      orderBy: { label: 'asc' },
    });
    const unitByKey = new Map(
      unitOptions.map((o) => [normalizeKey(o.label), o.label]),
    );
    const defaultUnit =
      unitOptions.find((o) => o.isDefault)?.label ??
      unitOptions[0]?.label ??
      DEFAULT_UNIT_FALLBACK;

    const resolvedRows: ResolvedRow[] = [];
    const errors: QuoteItemImportRowError[] = [];
    let index = 0;
    for await (const cells of parsed.rows) {
      const fileRow = index + 2;
      index++;
      if (cells.every((cell) => !cell?.trim())) continue;

      const mapped = mapQuoteItemImportCells(cells);
      const result = QuoteItemImportRowSchema.safeParse(mapped.data);
      const messages = [...mapped.errors];
      if (!result.success) {
        messages.push(
          ...formatImportZodIssues(
            result.error.issues,
            QUOTE_ITEM_IMPORT_FIELD_LABELS,
          ),
        );
      }
      let unit = defaultUnit;
      if (result.success && result.data.unit) {
        const known = unitByKey.get(normalizeKey(result.data.unit));
        if (known) {
          unit = known;
        } else if (unitOptions.length > 0) {
          messages.push(
            `"${result.data.unit}" birimi sistemde tanımlı değil. Tanımlı birimler: ${unitOptions.map((o) => o.label).join(', ')}.`,
          );
        } else {
          unit = result.data.unit;
        }
      }
      if (messages.length > 0 || !result.success) {
        errors.push({ row: fileRow, messages });
        continue;
      }
      resolvedRows.push({ row: result.data, unit });
    }

    if (errors.length > 0) {
      throw new AppException(
        'IMPORT_ROWS_INVALID',
        `Dosyada ${errors.length} hatalı satır var, hiçbir ürün eklenmedi. Satırları düzeltip tekrar yükleyin.`,
        HttpStatus.BAD_REQUEST,
        { errors },
      );
    }
    if (resolvedRows.length === 0) {
      throw new AppException(
        'IMPORT_EMPTY',
        'Dosyada içe aktarılacak ürün satırı bulunamadı.',
        HttpStatus.BAD_REQUEST,
      );
    }
    return resolvedRows;
  }

  private async createProductList(
    name: string,
    unmatched: [string, ResolvedRow][],
  ): Promise<{
    productList: { id: string; name: string };
    products: [string, ProductRef][];
  }> {
    const result = await this.prisma.$transaction(async (tx) => {
      // tenantId, tenant-scoped extension tarafindan calisma zamaninda eklenir
      const productList = await tx.productList.create({
        data: { name } as never,
      });
      const products: [string, ProductRef][] = [];
      for (const [key, { row, unit }] of unmatched) {
        const product = await tx.product.create({
          data: {
            productListId: productList.id,
            name: row.name,
            sku: row.sku,
            unit,
            price: row.unitPrice,
            currency: row.currency,
            brand: row.brand,
          } as never,
        });
        products.push([key, product]);
      }
      return { productList, products };
    });

    await this.audit.log({
      action: 'CREATE',
      entity: 'ProductList',
      entityId: result.productList.id,
      meta: { name: result.productList.name, source: 'quote-item-import' },
    });
    for (const [, product] of result.products) {
      await this.audit.log({
        action: 'CREATE',
        entity: 'Product',
        entityId: product.id,
        meta: { name: product.name },
      });
    }
    await this.productsCache.invalidate();
    await this.productLists.emitUpdated();
    return {
      productList: { id: result.productList.id, name: result.productList.name },
      products: result.products,
    };
  }
}
