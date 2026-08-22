import { InjectQueue } from '@nestjs/bullmq';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { Dashboard, DatasetField, DatasetFieldType } from '@prisma/client';
import type { Queue } from 'bullmq';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { AppException } from '../../core/errors/app.exception';
import {
  TENANT_PRISMA,
  type TenantPrismaClient,
} from '../../core/prisma/tenant-prisma.token';
import {
  INGEST_QUEUE,
  type IngestJobPayload,
} from '../../jobs/ingest-queue.constants';
import type { QuerySpec } from '../query/dto/query-spec.dto';
import { DashboardsService } from '../dashboards/dashboards.service';
import { DatasetsService } from '../datasets/datasets.service';
import { WidgetsService } from '../widgets/widgets.service';
import { generateRetailCsv } from './demo-datasets';

const DEMO_DATASET_NAME = 'Demo Satis Verisi';

@Injectable()
export class OnboardingService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    @InjectQueue(INGEST_QUEUE)
    private readonly ingestQueue: Queue<IngestJobPayload>,
    private readonly datasets: DatasetsService,
    private readonly dashboards: DashboardsService,
    private readonly widgets: WidgetsService,
  ) {}

  async seedDemoDataset(
    tenantId: string,
    userId: string,
  ): Promise<{ id: string }> {
    const csv = generateRetailCsv();
    const filePath = path.join(
      os.tmpdir(),
      `onboarding-demo-${randomUUID()}.csv`,
    );
    await fs.writeFile(filePath, csv, 'utf-8');

    const dataSource = await this.prisma.dataSource.create({
      data: {
        tenantId,
        name: DEMO_DATASET_NAME,
        type: 'CSV',
        originalFileName: 'demo-satis-verisi.csv',
        sizeBytes: Buffer.byteLength(csv),
        status: 'PENDING',
        createdById: userId,
      },
    });

    await this.ingestQueue.add('ingest-datasource', {
      dataSourceId: dataSource.id,
      tenantId,
      createdById: userId,
      filePath,
      dataSourceType: 'CSV',
      datasetName: DEMO_DATASET_NAME,
    });

    return { id: dataSource.id };
  }

  /**
   * Herhangi bir dataset icin, alan rollerine (MEASURE/DIMENSION/DATE)
   * bakarak jenerik bir baslangic panosu kurar. Sektor/domain bilgisi
   * gerektirmez - cekirdegin jenerik kalmasi ilkesine uyar (CLAUDE.md SS1).
   */
  async createStarterDashboard(
    datasetId: string,
    tenantId: string,
    userId: string,
  ): Promise<Dashboard> {
    const dataset = await this.datasets.getById(datasetId);
    const measure = dataset.fields.find(
      (f) => f.role === 'MEASURE' && f.isVisible,
    );
    if (!measure) {
      throw new AppException(
        'NO_MEASURE_FIELD',
        'Bu veri kumesinde sayisal bir olcu alani bulunamadi, otomatik pano olusturulamiyor.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const dateField = dataset.fields.find(
      (f) => f.role === 'DATE' && f.isVisible,
    );
    const dimensionField = dataset.fields.find(
      (f) => f.role === 'DIMENSION' && f.isVisible,
    );

    const dashboard = await this.dashboards.create(tenantId, userId, {
      name: `${dataset.name} - Ilk Panom`,
    });

    const kpiSpec = this.buildQuerySpec(datasetId, measure);
    const kpiWidget = await this.widgets.create(dashboard.id, {
      type: 'kpi',
      title: `Toplam ${measure.label}`,
      querySpec: kpiSpec,
      vizOptions: {},
      position: { x: 0, y: 0, w: 3, h: 2 },
    });
    const layout = [{ widgetId: kpiWidget.id, x: 0, y: 0, w: 3, h: 2 }];

    if (dateField) {
      const trendSpec = this.buildQuerySpec(datasetId, measure, dateField);
      const trendWidget = await this.widgets.create(dashboard.id, {
        type: 'line',
        title: `${measure.label} Trendi`,
        querySpec: trendSpec,
        vizOptions: {},
        position: { x: 3, y: 0, w: 5, h: 4 },
      });
      layout.push({ widgetId: trendWidget.id, x: 3, y: 0, w: 5, h: 4 });
    }

    if (dimensionField) {
      const breakdownSpec = this.buildQuerySpec(
        datasetId,
        measure,
        dimensionField,
      );
      const breakdownWidget = await this.widgets.create(dashboard.id, {
        type: 'bar',
        title: `${dimensionField.label} Kirilimi`,
        querySpec: breakdownSpec,
        vizOptions: {},
        position: { x: 0, y: 2, w: 3, h: 4 },
      });
      layout.push({ widgetId: breakdownWidget.id, x: 0, y: 2, w: 3, h: 4 });
    }

    await this.dashboards.update(dashboard.id, { layout });
    return dashboard;
  }

  private buildQuerySpec(
    datasetId: string,
    measure: DatasetField,
    dimension?: DatasetField,
  ): QuerySpec {
    return {
      datasetId,
      measures: [{ field: measure.name, agg: 'sum', alias: 'toplam' }],
      dimensions: dimension
        ? [
            {
              field: dimension.name,
              granularity: this.granularityFor(dimension.type),
            },
          ]
        : [],
      filters: [],
      orderBy: dimension ? [{ field: dimension.name, dir: 'asc' }] : [],
      limit: 1000,
    };
  }

  private granularityFor(
    type: DatasetFieldType,
  ): QuerySpec['dimensions'][number]['granularity'] {
    return type === 'DATE' ? 'month' : undefined;
  }
}
