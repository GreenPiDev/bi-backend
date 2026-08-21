import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DatasetFieldType } from '@prisma/client';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Pool } from 'pg';
import { from as copyFrom } from 'pg-copy-streams';
import {
  assertColumnName,
  datasetTableName,
  qualifiedTableName,
  quoteIdent,
  tenantSchemaName,
} from './identifier';

export interface ColumnDefinition {
  name: string;
  type: DatasetFieldType;
}

const SQL_TYPE_BY_FIELD_TYPE: Record<DatasetFieldType, string> = {
  STRING: 'text',
  NUMBER: 'double precision',
  DATE: 'timestamptz',
  BOOLEAN: 'boolean',
};

function formatCsvValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  const str = value instanceof Date ? value.toISOString() : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Thin wrapper around a raw `pg` pool for the parts of ingestion Prisma
 * cannot do safely: DDL and COPY against dynamically-named per-tenant
 * schemas/tables. All identifiers are derived deterministically from
 * validated UUIDs (see identifier.ts) — never from free-form user input.
 */
@Injectable()
export class RawSqlService implements OnModuleDestroy {
  private readonly pool: Pool;

  constructor(config: ConfigService) {
    this.pool = new Pool({
      connectionString: config.getOrThrow<string>('DATABASE_URL'),
      max: 5,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }

  async ensureTenantSchema(tenantId: string): Promise<string> {
    const schema = tenantSchemaName(tenantId);
    await this.pool.query(`CREATE SCHEMA IF NOT EXISTS ${quoteIdent(schema)}`);
    return schema;
  }

  async createDatasetTable(
    tenantId: string,
    datasetId: string,
    columns: ColumnDefinition[],
  ): Promise<{ schema: string; table: string }> {
    const schema = tenantSchemaName(tenantId);
    const table = datasetTableName(datasetId);
    const columnDefs = columns
      .map(
        (c) =>
          `${quoteIdent(assertColumnName(c.name))} ${SQL_TYPE_BY_FIELD_TYPE[c.type]}`,
      )
      .join(', ');
    await this.pool.query(
      `CREATE TABLE ${qualifiedTableName(schema, table)} (${columnDefs})`,
    );
    return { schema, table };
  }

  async copyRows(
    schema: string,
    table: string,
    columns: string[],
    rows: AsyncIterable<unknown[]>,
  ): Promise<number> {
    const client = await this.pool.connect();
    try {
      const columnList = columns
        .map((c) => quoteIdent(assertColumnName(c)))
        .join(', ');
      const copyStream = client.query(
        copyFrom(
          `COPY ${qualifiedTableName(schema, table)} (${columnList}) FROM STDIN WITH (FORMAT csv)`,
        ),
      );
      let rowCount = 0;
      async function* lines(): AsyncGenerator<string> {
        for await (const row of rows) {
          rowCount++;
          yield `${row.map(formatCsvValue).join(',')}\n`;
        }
      }
      await pipeline(Readable.from(lines()), copyStream);
      return rowCount;
    } finally {
      client.release();
    }
  }

  async renameColumn(
    tenantId: string,
    datasetId: string,
    oldName: string,
    newName: string,
  ): Promise<void> {
    const schema = tenantSchemaName(tenantId);
    const table = datasetTableName(datasetId);
    await this.pool.query(
      `ALTER TABLE ${qualifiedTableName(schema, table)} RENAME COLUMN ${quoteIdent(
        assertColumnName(oldName),
      )} TO ${quoteIdent(assertColumnName(newName))}`,
    );
  }

  async alterColumnType(
    tenantId: string,
    datasetId: string,
    columnName: string,
    newType: DatasetFieldType,
  ): Promise<void> {
    const schema = tenantSchemaName(tenantId);
    const table = datasetTableName(datasetId);
    const sqlType = SQL_TYPE_BY_FIELD_TYPE[newType];
    const column = quoteIdent(assertColumnName(columnName));
    await this.pool.query(
      `ALTER TABLE ${qualifiedTableName(schema, table)} ALTER COLUMN ${column} TYPE ${sqlType} USING ${column}::${sqlType}`,
    );
  }

  async previewRows(
    tenantId: string,
    datasetId: string,
    limit = 50,
  ): Promise<{ columns: string[]; rows: unknown[][] }> {
    const schema = tenantSchemaName(tenantId);
    const table = datasetTableName(datasetId);
    const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 500);
    const result = await this.pool.query(
      `SELECT * FROM ${qualifiedTableName(schema, table)} LIMIT ${safeLimit}`,
    );
    const columns = result.fields.map((field) => field.name);
    const rows = result.rows.map((row: Record<string, unknown>) =>
      columns.map((column) => row[column]),
    );
    return { columns, rows };
  }

  async dropTable(tenantId: string, datasetId: string): Promise<void> {
    const schema = tenantSchemaName(tenantId);
    const table = datasetTableName(datasetId);
    await this.pool.query(
      `DROP TABLE IF EXISTS ${qualifiedTableName(schema, table)}`,
    );
  }
}
