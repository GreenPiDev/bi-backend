import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { randomUUID } from 'node:crypto';
import * as fsPromises from 'node:fs/promises';
import { RawSqlService } from '../core/database/raw-sql.service';
import { PrismaService } from '../core/prisma/prisma.service';
import { FileParserService } from '../modules/datasources/file-parser.service';
import {
  TypeInferenceService,
  type InferredField,
} from '../modules/datasources/type-inference.service';
import { TYPE_INFERENCE_SAMPLE_SIZE } from '../modules/datasources/datasources.constants';
import { INGEST_QUEUE, type IngestJobPayload } from './ingest-queue.constants';
import { splitSample } from './sample-rows';

@Processor(INGEST_QUEUE)
export class IngestDatasourceProcessor extends WorkerHost {
  private readonly logger = new Logger(IngestDatasourceProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rawSql: RawSqlService,
    private readonly fileParser: FileParserService,
    private readonly typeInference: TypeInferenceService,
  ) {
    super();
  }

  async process(job: Job<IngestJobPayload>): Promise<void> {
    const { dataSourceId, tenantId, filePath, dataSourceType, datasetName } =
      job.data;
    const datasetId = randomUUID();

    try {
      await this.prisma.dataSource.update({
        where: { id: dataSourceId },
        data: { status: 'PROCESSING' },
      });

      const parsed = await this.fileParser.parse(filePath, dataSourceType);
      const { sample, all } = await splitSample(
        parsed.rows,
        TYPE_INFERENCE_SAMPLE_SIZE,
      );
      const fields = this.typeInference.inferSchema(parsed.headers, sample);

      await this.rawSql.ensureTenantSchema(tenantId);
      const { schema, table } = await this.rawSql.createDatasetTable(
        tenantId,
        datasetId,
        fields.map((f) => ({ name: f.name, type: f.type })),
      );

      const rowCount = await this.rawSql.copyRows(
        schema,
        table,
        fields.map((f) => f.name),
        this.coerceRows(all, fields),
      );

      await this.prisma.$transaction([
        this.prisma.dataset.create({
          data: {
            id: datasetId,
            tenantId,
            dataSourceId,
            name: datasetName,
            physicalTable: table,
            rowCount,
            lastIngestedAt: new Date(),
          },
        }),
        this.prisma.datasetField.createMany({
          data: fields.map((field, index) => ({
            datasetId,
            sourceName: field.sourceName,
            name: field.name,
            label: field.label,
            type: field.type,
            role: field.role,
            ordinal: index,
          })),
        }),
        this.prisma.dataSource.update({
          where: { id: dataSourceId },
          data: { status: 'READY' },
        }),
      ]);
    } catch (err) {
      this.logger.error(
        `Veri alimi basarisiz oldu (dataSourceId=${dataSourceId})`,
        err instanceof Error ? err.stack : String(err),
      );
      await this.rawSql.dropTable(tenantId, datasetId).catch(() => undefined);
      await this.prisma.dataSource
        .update({
          where: { id: dataSourceId },
          data: {
            status: 'FAILED',
            errorMessage: 'Dosya islenirken bir hata olustu.',
          },
        })
        .catch(() => undefined);
      throw err;
    } finally {
      await fsPromises.unlink(filePath).catch(() => undefined);
    }
  }

  private async *coerceRows(
    rows: AsyncIterable<string[]>,
    fields: InferredField[],
  ): AsyncGenerator<unknown[]> {
    for await (const row of rows) {
      yield fields.map((field, index) =>
        this.typeInference.coerceValue(row[index] ?? '', field.type),
      );
    }
  }
}
