import type { DataSourceType } from '@prisma/client';

export const INGEST_QUEUE = 'ingest';

export interface IngestJobPayload {
  dataSourceId: string;
  tenantId: string;
  createdById: string;
  filePath: string;
  dataSourceType: DataSourceType;
  datasetName: string;
}
