import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { DataSourceType } from '@prisma/client';
import { AppException } from '../../core/errors/app.exception';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { CreateProductSchema } from '../products/dto/product.dto';
import { ProductsCacheService } from '../products/products-cache.service';
import { FileParserService } from '../datasources/file-parser.service';
import type {
  NumberFormat,
  ProductImportAttributeColumnsDto,
  ProductImportMappingDto,
} from './dto/product-import.dto';
import { parseImportNumber } from './number-format';

const PREVIEW_SAMPLE_SIZE = 10;
const RAW_PREVIEW_ROW_COUNT = 14;
/** parseImportNumber ile sayiya cevrilmesi gereken hedef alanlar - digerleri (name,
 * sku, unit, currency, description, category) string olarak birebir gecer. */
const NUMERIC_TARGET_FIELDS = [
  'price',
  'costPrice',
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

@Injectable()
export class ProductImportsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly fileParser: FileParserService,
    private readonly productsCache: ProductsCacheService,
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
    const validRows: Record<string, unknown>[] = [];

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
        ...result.data,
        attributes: Object.keys(attributes).length > 0 ? attributes : undefined,
      });
    });

    if (validRows.length > 0) {
      await this.prisma.product.createMany({ data: validRows as never });
      await this.productsCache.invalidate();
    }

    return { totalRows: records.length, imported: validRows.length, errors };
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
