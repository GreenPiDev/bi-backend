import { HttpStatus } from '@nestjs/common';
import { AppException } from '../errors/app.exception';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const COLUMN_NAME_PATTERN = /^[a-z_][a-z0-9_]{0,40}$/;

const SAFE_IDENTIFIER_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export function assertUuid(value: string, kind: string): string {
  if (!UUID_PATTERN.test(value)) {
    throw new AppException(
      'INVALID_ID',
      `Gecersiz ${kind} kimligi.`,
      HttpStatus.BAD_REQUEST,
    );
  }
  return value;
}

export function assertColumnName(value: string): string {
  if (!COLUMN_NAME_PATTERN.test(value)) {
    throw new AppException(
      'INVALID_COLUMN_NAME',
      'Kolon adi sadece kucuk harf, rakam ve alt cizgi icerebilir, harf veya alt cizgi ile baslamalidir.',
      HttpStatus.BAD_REQUEST,
    );
  }
  return value;
}

export function tenantSchemaName(tenantId: string): string {
  assertUuid(tenantId, 'kiraci');
  return `tenant_${tenantId.replace(/-/g, '')}`;
}

export function datasetTableName(datasetId: string): string {
  assertUuid(datasetId, 'dataset');
  return `ds_${datasetId.replace(/-/g, '')}`;
}

export function quoteIdent(identifier: string): string {
  if (!SAFE_IDENTIFIER_PATTERN.test(identifier)) {
    throw new AppException(
      'INVALID_IDENTIFIER',
      'Gecersiz veritabani tanimlayicisi.',
      HttpStatus.BAD_REQUEST,
    );
  }
  return `"${identifier}"`;
}

export function qualifiedTableName(schema: string, table: string): string {
  return `${quoteIdent(schema)}.${quoteIdent(table)}`;
}
