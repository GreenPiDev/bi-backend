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

export interface DataSourceStatusView {
  id: string;
  status: DataSourceStatus;
  errorMessage: string | null;
  datasetId: string | null;
}

@Injectable()
export class DatasourcesService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    @InjectQueue(INGEST_QUEUE)
    private readonly ingestQueue: Queue<IngestJobPayload>,
    private readonly audit: AuditService,
  ) {}

  async upload(
    file: Express.Multer.File,
    name: string | undefined,
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
