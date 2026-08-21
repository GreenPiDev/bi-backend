import { describe, expect, it } from 'vitest';
import { AppException } from '../errors/app.exception';
import {
  assertColumnName,
  assertUuid,
  datasetTableName,
  qualifiedTableName,
  quoteIdent,
  tenantSchemaName,
} from './identifier';

const VALID_UUID = '123e4567-e89b-12d3-a456-426614174000';

describe('assertUuid', () => {
  it('accepts a well-formed uuid', () => {
    expect(assertUuid(VALID_UUID, 'test')).toBe(VALID_UUID);
  });

  it.each([
    'not-a-uuid',
    '123e4567-e89b-12d3-a456',
    '"; DROP TABLE users; --',
    '123e4567-e89b-12d3-a456-426614174000; DROP TABLE users;',
    '',
  ])('rejects %s', (value) => {
    expect(() => assertUuid(value, 'test')).toThrow(AppException);
  });
});

describe('assertColumnName', () => {
  it('accepts valid column names', () => {
    expect(assertColumnName('musteri_adi')).toBe('musteri_adi');
    expect(assertColumnName('_private')).toBe('_private');
  });

  it.each([
    'a"; DROP TABLE dataset_fields; --',
    '1invalid',
    'kolon adi',
    'kolon-adi',
    'a'.repeat(50),
    '',
  ])('rejects %s', (value) => {
    expect(() => assertColumnName(value)).toThrow(AppException);
  });
});

describe('tenantSchemaName / datasetTableName', () => {
  it('derives deterministic, dash-free names from a uuid', () => {
    expect(tenantSchemaName(VALID_UUID)).toBe(
      'tenant_123e4567e89b12d3a456426614174000',
    );
    expect(datasetTableName(VALID_UUID)).toBe(
      'ds_123e4567e89b12d3a456426614174000',
    );
  });

  it('rejects non-uuid input instead of interpolating it', () => {
    expect(() => tenantSchemaName('"; DROP SCHEMA public CASCADE; --')).toThrow(
      AppException,
    );
    expect(() => datasetTableName('"; DROP TABLE x; --')).toThrow(AppException);
  });
});

describe('quoteIdent', () => {
  it('quotes a safe identifier', () => {
    expect(quoteIdent('ds_abc123')).toBe('"ds_abc123"');
  });

  it.each(['"; DROP TABLE users; --', 'ds abc', 'ds-abc', '1abc', ''])(
    'rejects %s',
    (value) => {
      expect(() => quoteIdent(value)).toThrow(AppException);
    },
  );
});

describe('qualifiedTableName', () => {
  it('quotes both schema and table', () => {
    expect(qualifiedTableName('tenant_x', 'ds_y')).toBe('"tenant_x"."ds_y"');
  });

  it('rejects an unsafe schema or table name', () => {
    expect(() =>
      qualifiedTableName('tenant_x"; DROP TABLE x; --', 'ds_y'),
    ).toThrow(AppException);
  });
});
