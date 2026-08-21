import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { Dataset, DatasetField } from '@prisma/client';
import type { RawBuilder } from 'kysely';
import { AppException } from '../../core/errors/app.exception';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import {
  buildAggregationQuery,
  buildRowsQuery,
  type BuiltColumn,
} from './query-builder';
import { QueryCacheService } from './query-cache.service';
import { QuerySqlService } from './query-sql.service';
import {
  validateAggregationQuery,
  validateRowsQuery,
} from './query-validation';
import type { QueryResult, QuerySpec } from './dto/query-spec.dto';

type DatasetWithFields = Dataset & { fields: DatasetField[] };

@Injectable()
export class QueryService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly querySql: QuerySqlService,
    private readonly queryCache: QueryCacheService,
  ) {}

  async runQuery(spec: QuerySpec, tenantId: string): Promise<QueryResult> {
    const dataset = await this.requireDataset(spec.datasetId);

    const cached = await this.queryCache.get(
      tenantId,
      spec.datasetId,
      'query',
      spec,
    );
    if (cached) {
      return cached;
    }

    const { fieldsByName } = validateAggregationQuery(spec, dataset.fields);
    const built = buildAggregationQuery(
      spec,
      fieldsByName,
      dataset.fields,
      tenantId,
    );
    const result = await this.execute(built.raw, built.columns, spec.limit);

    await this.queryCache.set(tenantId, spec.datasetId, 'query', spec, result);
    return result;
  }

  async runRowsQuery(spec: QuerySpec, tenantId: string): Promise<QueryResult> {
    const dataset = await this.requireDataset(spec.datasetId);

    const cached = await this.queryCache.get(
      tenantId,
      spec.datasetId,
      'rows',
      spec,
    );
    if (cached) {
      return cached;
    }

    const fieldsByName = validateRowsQuery(spec, dataset.fields);
    const built = buildRowsQuery(spec, fieldsByName, dataset.fields, tenantId);
    const result = await this.execute(built.raw, built.columns, spec.limit);

    await this.queryCache.set(tenantId, spec.datasetId, 'rows', spec, result);
    return result;
  }

  private async execute(
    raw: RawBuilder<Record<string, unknown>>,
    columns: BuiltColumn[],
    limit: number,
  ): Promise<QueryResult> {
    const start = Date.now();
    const rows = await this.querySql.execute(raw);
    const executionMs = Date.now() - start;

    const truncated = rows.length > limit;
    const sliced = truncated ? rows.slice(0, limit) : rows;
    const resultRows = sliced.map((row) =>
      columns.map((c) => row[c.name] ?? null),
    );

    return {
      columns: columns.map((c) => ({
        name: c.name,
        type: c.type,
        label: c.label,
      })),
      rows: resultRows,
      rowCount: sliced.length,
      executionMs,
      truncated,
    };
  }

  private async requireDataset(datasetId: string): Promise<DatasetWithFields> {
    const dataset = await this.prisma.dataset.findFirst({
      where: { id: datasetId },
      include: { fields: true },
    });
    if (!dataset) {
      throw new AppException(
        'NOT_FOUND',
        'Dataset bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    return dataset;
  }
}
