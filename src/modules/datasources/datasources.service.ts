import { InjectQueue } from '@nestjs/bullmq';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { DataSourceStatus } from '@prisma/client';
import type { Queue } from 'bullmq';
import * as fsPromises from 'node:fs/promises';
import { AppException } from '../../core/errors/app.exception';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import {
  INGEST_QUEUE,
  type IngestJobPayload,
} from '../../jobs/ingest-queue.constants';
import { AuditService } from '../audit/audit.service';
import { detectDataSourceType } from './file-signature';
import { FileParserService } from './file-parser.service';

const RAW_PREVIEW_ROW_COUNT = 14;

export interface DataSourceStatusView {
  id: string;
  status: DataSourceStatus;
  errorMessage: string | null;
  datasetId: string | null;
}

export interface DataSourceRawPreview {
  rows: string[][];
}

@Injectable()
export class DatasourcesService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    @InjectQueue(INGEST_QUEUE)
    private readonly ingestQueue: Queue<IngestJobPayload>,
    private readonly audit: AuditService,
    private readonly fileParser: FileParserService,
  ) {}

  /**
   * headerRowIndex secilmeden once ham onizleme: satir 1 baslik varsayimiyla okunur,
   * ilk satirlarin tumu (baslik dahil) aynen gosterilir - kullanici hangi satirin
   * gercek baslik oldugunu goze bakarak secer (product-imports.service.ts'teki
   * previewRaw ile ayni desen, bkz. docs/VARSAYIMLAR.md V40).
   */
  async previewRaw(file: Express.Multer.File): Promise<DataSourceRawPreview> {
    try {
      const type = await detectDataSourceType(
        file.originalname,
        file.mimetype,
        file.path,
      );
      const parsed = await this.fileParser.parse(file.path, type, 0);
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
    } finally {
      await fsPromises.unlink(file.path).catch(() => undefined);
    }
  }

  async upload(
    file: Express.Multer.File,
    name: string | undefined,
    headerRowIndex: number,
    tenantId: string,
    userId: string,
  ): Promise<{ id: string }> {
    let type;
    try {
      type = await detectDataSourceType(
        file.originalname,
        file.mimetype,
        file.path,
      );
    } catch (err) {
      await fsPromises.unlink(file.path).catch(() => undefined);
      throw err;
    }

    const datasetName = name ?? file.originalname;

    const dataSource = await this.prisma.dataSource.create({
      data: {
        tenantId,
        name: datasetName,
        type,
        originalFileName: file.originalname,
        sizeBytes: file.size,
        status: 'PENDING',
        headerRowIndex,
        createdById: userId,
      },
    });

    await this.ingestQueue.add('ingest-datasource', {
      dataSourceId: dataSource.id,
      tenantId,
      createdById: userId,
      filePath: file.path,
      dataSourceType: type,
      datasetName,
      headerRowIndex,
    });

    await this.audit.log({
      action: 'UPLOAD',
      entity: 'DataSource',
      entityId: dataSource.id,
      meta: { fileName: file.originalname, sizeBytes: file.size },
    });

    return { id: dataSource.id };
  }

  async getStatus(id: string): Promise<DataSourceStatusView> {
    const dataSource = await this.prisma.dataSource.findFirst({
      where: { id },
      include: { datasets: { select: { id: true }, take: 1 } },
    });
    if (!dataSource) {
      throw new AppException(
        'NOT_FOUND',
        'Veri kaynagi bulunamadi.',
        HttpStatus.NOT_FOUND,
      );
    }
    return {
      id: dataSource.id,
      status: dataSource.status,
      errorMessage: dataSource.errorMessage,
      datasetId: dataSource.datasets[0]?.id ?? null,
    };
  }
}
