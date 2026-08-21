import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { Dataset, DatasetField } from '@prisma/client';
import { RawSqlService } from '../../core/database/raw-sql.service';
import { AppException } from '../../core/errors/app.exception';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import { QueryCacheService } from '../query/query-cache.service';
import type { UpdateDatasetFieldDto } from './dto/update-dataset-fields.dto';

export type DatasetWithFields = Dataset & { fields: DatasetField[] };

export interface PreviewResult {
  columns: string[];
  rows: unknown[][];
}

@Injectable()
export class DatasetsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly rawSql: RawSqlService,
    private readonly queryCache: QueryCacheService,
  ) {}

  async list(): Promise<Dataset[]> {
    return this.prisma.dataset.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async getById(id: string): Promise<DatasetWithFields> {
    return this.requireDataset(id);
  }

  async preview(id: string, tenantId: string): Promise<PreviewResult> {
    await this.requireDataset(id);
    return this.rawSql.previewRows(tenantId, id, 50);
  }

  async updateFields(
    id: string,
    tenantId: string,
    updates: UpdateDatasetFieldDto[],
  ): Promise<DatasetWithFields> {
    const dataset = await this.requireDataset(id);
    const fieldsById = new Map(dataset.fields.map((f) => [f.id, f]));

    for (const update of updates) {
      const existing = fieldsById.get(update.id);
      if (!existing) {
        throw new AppException(
          'FIELD_NOT_FOUND',
          'Belirtilen kolon bu datasete ait degil.',
          HttpStatus.BAD_REQUEST,
        );
      }

      try {
        if (update.name && update.name !== existing.name) {
          await this.rawSql.renameColumn(
            tenantId,
            id,
            existing.name,
            update.name,
          );
        }
        if (update.type && update.type !== existing.type) {
          const columnName = update.name ?? existing.name;
          await this.rawSql.alterColumnType(
            tenantId,
            id,
            columnName,
            update.type,
          );
        }
      } catch {
        throw new AppException(
          'SCHEMA_UPDATE_FAILED',
          'Kolon guncellenemedi. Kolon adi baska bir kolonla cakisiyor olabilir veya veri yeni tipe donusturulemedi.',
          HttpStatus.BAD_REQUEST,
        );
      }

      await this.prisma.datasetField.update({
        where: { id: update.id },
        data: {
          name: update.name,
          label: update.label,
          type: update.type,
          role: update.role,
          format: update.format,
          isVisible: update.isVisible,
        },
      });
    }

    await this.queryCache.invalidateDataset(tenantId, id);

    return this.requireDataset(id);
  }

  private async requireDataset(id: string): Promise<DatasetWithFields> {
    const dataset = await this.prisma.dataset.findFirst({
      where: { id },
      include: { fields: { orderBy: { ordinal: 'asc' } } },
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
