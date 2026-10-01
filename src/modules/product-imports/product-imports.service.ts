import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { DataSourceType, Prisma, Product } from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { CreateProductSchema } from '../products/dto/product.dto';
import { ProductPriceHistoryCacheService } from '../products/product-price-history-cache.service';
import { ProductsCacheService } from '../products/products-cache.service';
import { FileParserService } from '../datasources/file-parser.service';
import { AuditService } from '../audit/audit.service';
import type {
  NumberFormat,
  ProductImportAttributeColumnsDto,
  ProductImportMappingDto,
} from './dto/product-import.dto';
import { normalizeCurrency, parseImportNumber } from './number-format';

const PREVIEW_SAMPLE_SIZE = 10;
const RAW_PREVIEW_ROW_COUNT = 14;
/** parseImportNumber ile sayiya cevrilmesi gereken hedef alanlar - currency ayrica
 * normalizeCurrency'den gecer (bkz. asagida), digerleri (name, sku, unit, description,
 * category) string olarak birebir gecer. */
const NUMERIC_TARGET_FIELDS = [
  'price',
  'maxDiscountPct',
  'minStockLevel',
] as const;

export interface ProductImportRowError {
  row: number;
  messages: string[];
}

export interface ProductImportResult {
  totalRows: number;
  imported: number;
  created: number;
  updated: number;
  errors: ProductImportRowError[];
}

export interface ProductImportRawPreview {
  rows: string[][];
}

export interface ProductImportPreview {
  headers: string[];
  sampleRows: Record<string, string>[];
  totalRows: number;
}

function rowsToRecords(
  headers: string[],
  rows: string[][],
): Record<string, string>[] {
  return rows.map((row) => {
    const record: Record<string, string> = {};
    headers.forEach((header, i) => {
      record[header] = row[i] ?? '';
    });
    return record;
  });
}

function mappingIncompleteError(message: string): AppException {
  return new AppException(
    'MAPPING_INCOMPLETE',
    message,
    HttpStatus.BAD_REQUEST,
  );
}

/** Ayni excel'i tekrar yuklerken kesisen urunleri eslestirmek icin (bkz.
 * docs/VARSAYIMLAR.md V44) - bastaki/sondaki bosluk ve buyuk/kucuk harf farki ayni
 * urun sayilir. */
function normalizeProductName(name: string): string {
  return name.trim().toLowerCase();
}

interface ValidImportRow {
  data: Record<string, unknown>;
  /** Dosyada gercekten eslenmis (bos olmayan) hedef alanlar - guncellemede sadece
   * bunlar yazilir, eslenmemis alanlara dokunulmaz. */
  providedFields: string[];
  attributes: Record<string, string>;
}

@Injectable()
export class ProductImportsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly fileParser: FileParserService,
    private readonly productsCache: ProductsCacheService,
    private readonly priceHistoryCache: ProductPriceHistoryCacheService,
    private readonly audit: AuditService,
  ) {}

  /**
   * headerRowIndex secilmeden once ham onizleme: satir 1 (0-based headerRowIndex=0)
   * baslik varsayimiyla okunur, ilk satirlarin tumu (baslik dahil) aynen gosterilir -
   * kullanici hangi satirin gercek baslik oldugunu goze bakarak secer (bkz.
   * docs/VARSAYIMLAR.md V40, otomatik tahmin yerine kullanici secimi).
   */
  async previewRaw(
    filePath: string,
    type: DataSourceType,
  ): Promise<ProductImportRawPreview> {
    const parsed = await this.fileParser.parse(filePath, type, 0);
    const rows: string[][] = [parsed.headers];
    let count = 0;
    for await (const row of parsed.rows) {
      if (count >= RAW_PREVIEW_ROW_COUNT) {
        break;
      }
      rows.push(row);
      count++;
    }
    return { rows };
  }

  async preview(
    filePath: string,
    type: DataSourceType,
    headerRowIndex: number,
  ): Promise<ProductImportPreview> {
    const { headers, rows } = await this.readRows(
      filePath,
      type,
      headerRowIndex,
    );
    const records = rowsToRecords(headers, rows);
    return {
      headers,
      sampleRows: records.slice(0, PREVIEW_SAMPLE_SIZE),
      totalRows: records.length,
    };
  }

  async importProducts(
    filePath: string,
    type: DataSourceType,
    headerRowIndex: number,
    productListId: string,
    mapping: ProductImportMappingDto,
    attributeColumns: ProductImportAttributeColumnsDto,
    numberFormat: NumberFormat,
  ): Promise<ProductImportResult> {
    if (!mapping.name) {
      throw mappingIncompleteError("'name' alani bir sutuna eslenmelidir.");
    }
    const productList = await this.prisma.productList.findFirst({
      where: { id: productListId },
    });
    if (!productList) {
      throw new AppException(
        'NOT_FOUND',
        'Urun listesi bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    const { headers, rows } = await this.readRows(
      filePath,
      type,
      headerRowIndex,
    );
    const records = rowsToRecords(headers, rows);
    const errors: ProductImportRowError[] = [];
    const validRows: ValidImportRow[] = [];

    records.forEach((record, index) => {
      const mapped: Record<string, unknown> = { productListId };
      for (const [target, source] of Object.entries(mapping)) {
        if (!source) {
          continue;
        }
        const rawValue = record[source];
        if (rawValue === undefined || rawValue === '') {
          continue;
        }
        if ((NUMERIC_TARGET_FIELDS as readonly string[]).includes(target)) {
          mapped[target] = parseImportNumber(rawValue, numberFormat);
        } else if (target === 'currency') {
          mapped[target] = normalizeCurrency(rawValue);
        } else {
          mapped[target] = rawValue;
        }
      }

      const attributes: Record<string, string> = {};
      for (const column of attributeColumns) {
        const value = record[column];
        if (value) {
          attributes[column] = value;
        }
      }

      const result = CreateProductSchema.safeParse(mapped);
      const fileRow = headerRowIndex + 2 + index;
      if (!result.success) {
        errors.push({
          row: fileRow,
          messages: result.error.issues.map(
            (issue) => `${issue.path.join('.')}: ${issue.message}`,
          ),
        });
        return;
      }
      validRows.push({
        data: result.data as Record<string, unknown>,
        providedFields: Object.keys(mapped).filter(
          (key) => key !== 'productListId',
        ),
        attributes,
      });
    });

    let created = 0;
    let updated = 0;

    if (validRows.length > 0) {
      // Ayni excel iki kez (veya kismen kesisen iki excel) yuklenirse, ikinci
      // yuklemede ayni ada sahip urunler tekrar eklenmez, mevcut kaydin uzerine
      // yazilir - urun adi tenant genelinde (secili urun listesiyle sinirli
      // olmadan), bas/son bosluk ve buyuk/kucuk harf yok sayilarak eslestirilir.
      // Dosyada eslenmemis alanlara dokunulmaz, attributes (marka'ya ozgu kolonlar)
      // birlestirilir (eski anahtarlar silinmez). Bkz. docs/VARSAYIMLAR.md V44.
      const existingProducts = await this.prisma.product.findMany();
      const byName = new Map<string, Product>();
      for (const product of existingProducts) {
        byName.set(normalizeProductName(product.name), product);
      }

      for (const row of validRows) {
        const key = normalizeProductName(row.data.name as string);
        const existing = byName.get(key);

        if (existing) {
          const updateData: Record<string, unknown> = {};
          for (const field of row.providedFields) {
            updateData[field] = row.data[field];
          }
          if (Object.keys(row.attributes).length > 0) {
            const existingAttributes =
              (existing.attributes as Record<string, string> | null) ?? {};
            updateData.attributes = {
              ...existingAttributes,
              ...row.attributes,
            };
          }

          const previousPrice = existing.price;
          const previousCurrency = existing.currency;
          const product = await this.prisma.product.update({
            where: { id: existing.id },
            data: updateData as never,
          });
          byName.set(key, product);
          updated++;

          await this.audit.log({
            action: 'UPDATE',
            entity: 'Product',
            entityId: product.id,
          });
          if (
            row.providedFields.includes('price') &&
            Number(product.price ?? 0) !== Number(previousPrice ?? 0)
          ) {
            await this.logPriceChange(
              'UPDATE',
              product.id,
              product.name,
              previousPrice,
              previousCurrency,
              product.price == null ? null : Number(product.price),
              product.currency,
            );
          }
        } else {
          const product = await this.prisma.product.create({
            data: {
              ...row.data,
              attributes:
                Object.keys(row.attributes).length > 0
                  ? row.attributes
                  : undefined,
            } as never,
          });
          byName.set(key, product);
          created++;

          await this.audit.log({
            action: 'CREATE',
            entity: 'Product',
            entityId: product.id,
            meta: { name: product.name },
          });
          if (product.price != null) {
            await this.logPriceChange(
              'CREATE',
              product.id,
              product.name,
              null,
              null,
              Number(product.price),
              product.currency,
            );
          }
        }
      }

      await this.productsCache.invalidate();
    }

    return {
      totalRows: records.length,
      imported: created + updated,
      created,
      updated,
      errors,
    };
  }

  /** Urunun fiyati olusturulurken/guncellenirken degistiginde 'ProductPrice' adinda
   * ayri bir denetim-kaydi kovasina yazar - ProductsService.logPriceChange ile ayni
   * desen, Fiyat Gecmisi (/envanter?tab=priceHistory) bunu okur. */
  private async logPriceChange(
    action: 'CREATE' | 'UPDATE',
    productId: string,
    productName: string,
    previousPrice: Prisma.Decimal | null,
    previousCurrency: string | null,
    price: number | null,
    currency: string,
  ): Promise<void> {
    await this.audit.log({
      action,
      entity: 'ProductPrice',
      entityId: productId,
      meta: {
        productId,
        productName,
        previousPrice,
        previousCurrency,
        price,
        currency,
      },
    });
    await this.priceHistoryCache.invalidate(productId);
  }

  private async readRows(
    filePath: string,
    type: DataSourceType,
    headerRowIndex: number,
  ): Promise<{ headers: string[]; rows: string[][] }> {
    const parsed = await this.fileParser.parse(filePath, type, headerRowIndex);
    const rows: string[][] = [];
    for await (const row of parsed.rows) {
      rows.push(row);
    }
    return { headers: parsed.headers, rows };
  }
}
