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
import type { ParsedFile } from '../datasources/file-parser.service';
import {
  QUOTE_GROUPED_ITEM_IMPORT_COLUMNS,
  collectGroupedImportRows,
  validateQuoteGroupedItemImportHeaders,
} from './quote-grouped-item-import.format';
import {
  QUOTE_ITEM_IMPORT_COLUMNS,
  QUOTE_ITEM_IMPORT_FIELD_LABELS,
  buildImportedProductListName,
  QuoteItemImportRowSchema,
  mapQuoteItemImportCells,
  validateQuoteItemImportHeaders,
  type QuoteItemImportLine,
  type QuoteItemImportResult,
  type QuoteItemImportRowError,
} from './quote-item-import.format';

export type { QuoteItemImportResult } from './quote-item-import.format';

const DEFAULT_UNIT_FALLBACK = 'adet';

const UNKNOWN_TEMPLATE_MESSAGE = `Dosya örnek şablonlardan hiçbirine uymuyor. İlk satırda ya grupsuz şablonun başlıkları (${QUOTE_ITEM_IMPORT_COLUMNS.map((c) => c.header).join(', ')}) ya da gruplu şablonun başlıkları (${QUOTE_GROUPED_ITEM_IMPORT_COLUMNS.map((c) => c.header).join(', ')}) sırasıyla olmalı. Lütfen "Örnek Excel" menüsünden uygun şablonu indirip ürünlerinizi o dosyaya girin.`;

/** Iki formatin (grupsuz/gruplu) ortak, dogrulanmis satir bicimi. Gruplu formatta
 * fiyat/para birimi/iskonto/KDV yoktur - eslesen urunun kayitli degerleri (yoksa 0/TRY)
 * kullanilir. */
interface NormalizedImportRow {
  sku?: string;
  name: string;
  brand?: string;
  quantity: number;
  unit: string;
  unitPrice?: number;
  currency?: string;
  discountPct: number;
  vatPct?: number;
  groupName: string | null;
}

interface ProductRef {
  id: string;
  name: string;
  sku: string | null;
  brand: string | null;
  productListId: string;
  price: unknown;
  currency: string;
}

type UnitResolution = { unit: string } | { error: string };

function normalizeKey(value: string): string {
  return value.trim().toLocaleLowerCase('tr-TR');
}

function throwRowErrors(errors: QuoteItemImportRowError[]): never {
  throw new AppException(
    'IMPORT_ROWS_INVALID',
    `Dosyada ${errors.length} hatalı satır var, hiçbir ürün eklenmedi. Satırları düzeltip tekrar yükleyin.`,
    HttpStatus.BAD_REQUEST,
    { errors },
  );
}

function throwEmpty(): never {
  throw new AppException(
    'IMPORT_EMPTY',
    'Dosyada içe aktarılacak ürün satırı bulunamadı.',
    HttpStatus.BAD_REQUEST,
  );
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
    const parsed = await this.fileParser.parse(filePath, type, 0);
    // Tek "Excel'den İçe Aktar" butonu (docs/VARSAYIMLAR.md V86): format baslik
    // satirindan otomatik algilanir - iki sablonun basliklari tamamen farkli.
    if (validateQuoteGroupedItemImportHeaders(parsed.headers) === null) {
      return this.importGroupedRows(parsed, originalFileName);
    }
    const ungroupedError = validateQuoteItemImportHeaders(parsed.headers);
    if (ungroupedError) {
      throw new AppException(
        'INVALID_TEMPLATE',
        UNKNOWN_TEMPLATE_MESSAGE,
        HttpStatus.BAD_REQUEST,
      );
    }
    const rows = await this.readUngroupedRows(parsed);
    return {
      ...(await this.resolveRows(rows, originalFileName)),
      format: 'UNGROUPED',
    };
  }

  /**
   * Gruplu sablon (bkz. quote-grouped-item-import.format.ts, docs/VARSAYIMLAR.md V86):
   * sadece Urun Kodu/Malzeme Adi/Marka/Miktar/Birim; urunlerin arasindaki grup satirlari
   * grup adi olur. Eslestirme ve yeni urun listesi kurallari grupsuz akisla aynidir.
   */
  private async importGroupedRows(
    parsed: ParsedFile,
    originalFileName: string,
  ): Promise<QuoteItemImportResult> {
    const resolveUnit = await this.loadUnitResolver();
    const collected = await collectGroupedImportRows(parsed.rows);
    const errors = [...collected.errors];
    const rows: NormalizedImportRow[] = [];
    for (const { row, groupName, fileRow } of collected.items) {
      const unit = resolveUnit(row.unit);
      if ('error' in unit) {
        errors.push({ row: fileRow, messages: [unit.error] });
        continue;
      }
      rows.push({ ...row, unit: unit.unit, discountPct: 0, groupName });
    }
    if (errors.length > 0) {
      throwRowErrors(errors.sort((a, b) => a.row - b.row));
    }
    if (rows.length === 0) throwEmpty();
    return {
      ...(await this.resolveRows(rows, originalFileName)),
      format: 'GROUPED',
    };
  }

  private async resolveRows(
    rows: NormalizedImportRow[],
    originalFileName: string,
  ): Promise<Omit<QuoteItemImportResult, 'format'>> {
    const existing: ProductRef[] = await this.prisma.product.findMany({
      select: {
        id: true,
        name: true,
        sku: true,
        brand: true,
        productListId: true,
        price: true,
        currency: true,
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
    const findExisting = (row: NormalizedImportRow): ProductRef | undefined =>
      row.sku
        ? bySku.get(normalizeKey(row.sku))
        : byName.get(normalizeKey(row.name));
    // Ayni (bulunamayan) urun dosyada birden fazla satirda gecerse bir kez olusturulur.
    const newProductKey = (row: NormalizedImportRow): string =>
      row.sku
        ? `sku:${normalizeKey(row.sku)}`
        : `name:${normalizeKey(row.name)}`;

    const unmatched = new Map<string, NormalizedImportRow>();
    for (const row of rows) {
      if (!findExisting(row)) {
        const key = newProductKey(row);
        if (!unmatched.has(key)) unmatched.set(key, row);
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

    const items = rows.map((row): QuoteItemImportLine => {
      const product = findExisting(row) ?? createdByKey.get(newProductKey(row));
      if (!product) {
        throw new Error(
          'Imported quote item could not be resolved to a product.',
        );
      }
      return {
        productId: product.id,
        productListId: product.productListId,
        quantity: row.quantity,
        unit: row.unit,
        unitPrice:
          row.unitPrice ?? (product.price == null ? 0 : Number(product.price)),
        currency: row.currency ?? product.currency,
        discountPct: row.discountPct,
        vatPct: row.vatPct ?? null,
        brand: row.brand ?? product.brand ?? null,
        groupName: row.groupName,
      };
    });

    return {
      items,
      productList,
      matchedCount: rows.filter((row) => findExisting(row)).length,
      createdProductCount: createdByKey.size,
    };
  }

  /** Dosyadaki Birim degerini tenant'in tanimli birim seceneklerine cozer: bossa
   * varsayilan birim; doluysa tanimli seceneklerden biri olmali (hic secenek
   * tanimlanmamissa dosyadaki deger aynen kullanilir). */
  private async loadUnitResolver(): Promise<
    (raw: string | undefined) => UnitResolution
  > {
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
    return (raw) => {
      if (!raw) return { unit: defaultUnit };
      const known = unitByKey.get(normalizeKey(raw));
      if (known) return { unit: known };
      if (unitOptions.length === 0) return { unit: raw };
      return {
        error: `"${raw}" birimi sistemde tanımlı değil. Tanımlı birimler: ${unitOptions.map((o) => o.label).join(', ')}.`,
      };
    };
  }

  private async readUngroupedRows(
    parsed: ParsedFile,
  ): Promise<NormalizedImportRow[]> {
    const resolveUnit = await this.loadUnitResolver();

    const resolvedRows: NormalizedImportRow[] = [];
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
      let unit = '';
      if (result.success) {
        const resolution = resolveUnit(result.data.unit);
        if ('error' in resolution) messages.push(resolution.error);
        else unit = resolution.unit;
      }
      if (messages.length > 0 || !result.success) {
        errors.push({ row: fileRow, messages });
        continue;
      }
      resolvedRows.push({ ...result.data, unit, groupName: null });
    }

    if (errors.length > 0) throwRowErrors(errors);
    if (resolvedRows.length === 0) throwEmpty();
    return resolvedRows;
  }

  private async createProductList(
    name: string,
    unmatched: [string, NormalizedImportRow][],
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
      for (const [key, row] of unmatched) {
        // Gruplu formatta fiyat yok - urun fiyatsiz (null) olusturulur, para birimi
        // DB varsayilani (TRY) kalir.
        const product = await tx.product.create({
          data: {
            productListId: productList.id,
            name: row.name,
            sku: row.sku,
            unit: row.unit,
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
