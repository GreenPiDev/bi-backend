/**
 * `npm run seed:demo` — demo kiraci + 3 sektorden ornek veri seti + hazir
 * panolar olusturur (Faz 7). Idempotenttir: ayni demo kiraci zaten varsa
 * once tamamen temizlenir, sonra sifirdan kurulur.
 *
 * Gercek yukleme akisiyla (DatasourcesService.upload) ayni ingest mantigini
 * kullanmak icin IngestDatasourceProcessor.process() dogrudan cagrilir;
 * boylece demo verisi de production'daki tip cikarim/COPY yoluyla gecer.
 */
import { NestFactory } from '@nestjs/core';
import type { Job } from 'bullmq';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../app.module';
import { PrismaService } from '../core/prisma/prisma.service';
import { RawSqlService } from '../core/database/raw-sql.service';
import { TenantContext } from '../core/tenant/tenant-context';
import { AuthService } from '../modules/auth/auth.service';
import { DashboardsService } from '../modules/dashboards/dashboards.service';
import { WidgetsService } from '../modules/widgets/widgets.service';
import type { DatasetField } from '@prisma/client';
import { IngestDatasourceProcessor } from '../jobs/ingest-datasource.processor';
import type { IngestJobPayload } from '../jobs/ingest-queue.constants';
import type { QuerySpec } from '../modules/query/dto/query-spec.dto';
import type { WidgetType } from '../modules/widgets/dto/widget.dto';
import {
  generateClinicCsv,
  generateLogisticsCsv,
  generateRetailCsv,
} from '../modules/onboarding/demo-datasets';

const DEMO_TENANT_SLUG = 'demo-sirket';
const DEMO_EMAIL = 'demo@pilens.com';
const DEMO_PASSWORD = 'DemoPiLens2026!';
const DEMO_NAME = 'Demo Kullanici';
const DEMO_TENANT_NAME = 'Demo Sirket';

interface SectorPlan {
  key: string;
  datasetName: string;
  csv: string;
  buildDashboard: (
    fields: DatasetField[],
    datasetId: string,
  ) => {
    dashboardName: string;
    widgets: { title: string; type: WidgetType; querySpec: QuerySpec }[];
  };
}

function fieldByLabel(fields: DatasetField[], label: string): DatasetField {
  const field = fields.find(
    (f) =>
      f.label.toLocaleLowerCase('tr-TR') === label.toLocaleLowerCase('tr-TR'),
  );
  if (!field) {
    throw new Error(`Beklenen alan bulunamadi: ${label}`);
  }
  return field;
}

function sectorPlans(): SectorPlan[] {
  return [
    {
      key: 'retail',
      datasetName: 'Perakende Satis (Demo)',
      csv: generateRetailCsv(),
      buildDashboard: (fields, datasetId) => {
        const tutar = fieldByLabel(fields, 'Toplam Tutar');
        const sehir = fieldByLabel(fields, 'Şehir');
        const kategori = fieldByLabel(fields, 'Kategori');
        const tarih = fieldByLabel(fields, 'Satış Tarihi');
        return {
          dashboardName: 'Satis Panosu (Demo)',
          widgets: [
            {
              title: 'Toplam Ciro',
              type: 'kpi',
              querySpec: {
                datasetId,
                measures: [{ field: tutar.name, agg: 'sum', alias: 'toplam' }],
                dimensions: [],
                filters: [],
                orderBy: [],
                limit: 1000,
              },
            },
            {
              title: 'Aylik Ciro',
              type: 'line',
              querySpec: {
                datasetId,
                measures: [{ field: tutar.name, agg: 'sum', alias: 'toplam' }],
                dimensions: [{ field: tarih.name, granularity: 'month' }],
                filters: [],
                orderBy: [{ field: tarih.name, dir: 'asc' }],
                limit: 1000,
              },
            },
            {
              title: 'Sehire Gore Ciro',
              type: 'bar',
              querySpec: {
                datasetId,
                measures: [{ field: tutar.name, agg: 'sum', alias: 'toplam' }],
                dimensions: [{ field: sehir.name }],
                filters: [],
                orderBy: [{ field: 'toplam', dir: 'desc' }],
                limit: 1000,
              },
            },
            {
              title: 'Kategoriye Gore Dagilim',
              type: 'pie',
              querySpec: {
                datasetId,
                measures: [{ field: tutar.name, agg: 'sum', alias: 'toplam' }],
                dimensions: [{ field: kategori.name }],
                filters: [],
                orderBy: [],
                limit: 1000,
              },
            },
          ],
        };
      },
    },
    {
      key: 'logistics',
      datasetName: 'Kargo Lojistik (Demo)',
      csv: generateLogisticsCsv(),
      buildDashboard: (fields, datasetId) => {
        const ucret = fieldByLabel(fields, 'Kargo Ücreti');
        const il = fieldByLabel(fields, 'Alıcı İl');
        const tarih = fieldByLabel(fields, 'Gönderi Tarihi');
        const teslim = fieldByLabel(fields, 'Teslim Edildi mi');
        return {
          dashboardName: 'Lojistik Panosu (Demo)',
          widgets: [
            {
              title: 'Toplam Kargo Geliri',
              type: 'kpi',
              querySpec: {
                datasetId,
                measures: [{ field: ucret.name, agg: 'sum', alias: 'toplam' }],
                dimensions: [],
                filters: [],
                orderBy: [],
                limit: 1000,
              },
            },
            {
              title: 'Aylik Gonderi Geliri',
              type: 'line',
              querySpec: {
                datasetId,
                measures: [{ field: ucret.name, agg: 'sum', alias: 'toplam' }],
                dimensions: [{ field: tarih.name, granularity: 'month' }],
                filters: [],
                orderBy: [{ field: tarih.name, dir: 'asc' }],
                limit: 1000,
              },
            },
            {
              title: 'Ile Gore Gonderi Sayisi',
              type: 'bar_horizontal',
              querySpec: {
                datasetId,
                measures: [{ field: ucret.name, agg: 'count', alias: 'adet' }],
                dimensions: [{ field: il.name }],
                filters: [],
                orderBy: [{ field: 'adet', dir: 'desc' }],
                limit: 1000,
              },
            },
            {
              title: 'Teslimat Durumu',
              type: 'pie',
              querySpec: {
                datasetId,
                measures: [{ field: ucret.name, agg: 'count', alias: 'adet' }],
                dimensions: [{ field: teslim.name }],
                filters: [],
                orderBy: [],
                limit: 1000,
              },
            },
          ],
        };
      },
    },
    {
      key: 'clinic',
      datasetName: 'Klinik Randevu (Demo)',
      csv: generateClinicCsv(),
      buildDashboard: (fields, datasetId) => {
        const ucret = fieldByLabel(fields, 'Ücret');
        const bolum = fieldByLabel(fields, 'Bölüm');
        const tarih = fieldByLabel(fields, 'Randevu Tarihi');
        const odendi = fieldByLabel(fields, 'Ödendi mi');
        return {
          dashboardName: 'Klinik Panosu (Demo)',
          widgets: [
            {
              title: 'Toplam Randevu Geliri',
              type: 'kpi',
              querySpec: {
                datasetId,
                measures: [{ field: ucret.name, agg: 'sum', alias: 'toplam' }],
                dimensions: [],
                filters: [],
                orderBy: [],
                limit: 1000,
              },
            },
            {
              title: 'Aylik Gelir',
              type: 'line',
              querySpec: {
                datasetId,
                measures: [{ field: ucret.name, agg: 'sum', alias: 'toplam' }],
                dimensions: [{ field: tarih.name, granularity: 'month' }],
                filters: [],
                orderBy: [{ field: tarih.name, dir: 'asc' }],
                limit: 1000,
              },
            },
            {
              title: 'Bolume Gore Randevu Sayisi',
              type: 'bar',
              querySpec: {
                datasetId,
                measures: [{ field: ucret.name, agg: 'count', alias: 'adet' }],
                dimensions: [{ field: bolum.name }],
                filters: [],
                orderBy: [{ field: 'adet', dir: 'desc' }],
                limit: 1000,
              },
            },
            {
              title: 'Odeme Durumu',
              type: 'pie',
              querySpec: {
                datasetId,
                measures: [{ field: ucret.name, agg: 'count', alias: 'adet' }],
                dimensions: [{ field: odendi.name }],
                filters: [],
                orderBy: [],
                limit: 1000,
              },
            },
          ],
        };
      },
    },
  ];
}

async function cleanupExistingDemoTenant(
  prisma: PrismaService,
  rawSql: RawSqlService,
): Promise<void> {
  const tenant = await prisma.tenant.findUnique({
    where: { slug: DEMO_TENANT_SLUG },
  });
  if (!tenant) {
    return;
  }
  console.log(`Mevcut demo kiraci bulundu (${tenant.id}), temizleniyor...`);
  await prisma.auditLog.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.alert.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.scheduledReport.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.widget.deleteMany({
    where: { dashboard: { tenantId: tenant.id } },
  });
  await prisma.dashboard.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.datasetField.deleteMany({
    where: { dataset: { tenantId: tenant.id } },
  });
  await prisma.dataset.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.dataSource.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.invitation.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.tenantModule.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.user.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.tenant.delete({ where: { id: tenant.id } });
  await rawSql.dropTenantSchema(tenant.id);
}

async function ingestSector(
  processor: IngestDatasourceProcessor,
  prisma: PrismaService,
  tenantId: string,
  createdById: string,
  plan: SectorPlan,
): Promise<string> {
  const filePath = path.join(
    os.tmpdir(),
    `seed-${plan.key}-${randomUUID()}.csv`,
  );
  await fs.writeFile(filePath, plan.csv, 'utf-8');

  const dataSource = await prisma.dataSource.create({
    data: {
      tenantId,
      name: plan.datasetName,
      type: 'CSV',
      originalFileName: `${plan.key}.csv`,
      sizeBytes: Buffer.byteLength(plan.csv),
      status: 'PENDING',
      createdById,
    },
  });

  const payload: IngestJobPayload = {
    dataSourceId: dataSource.id,
    tenantId,
    createdById,
    filePath,
    dataSourceType: 'CSV',
    datasetName: plan.datasetName,
  };
  await processor.process({ data: payload } as Job<IngestJobPayload>);

  const dataset = await prisma.dataset.findFirst({
    where: { dataSourceId: dataSource.id },
  });
  if (!dataset) {
    throw new Error(`Ingest basarisiz oldu: ${plan.datasetName}`);
  }
  return dataset.id;
}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const prisma = app.get(PrismaService);
    const rawSql = app.get(RawSqlService);
    const auth = app.get(AuthService);
    const dashboards = app.get(DashboardsService);
    const widgets = app.get(WidgetsService);
    const ingestProcessor = app.get(IngestDatasourceProcessor);

    await cleanupExistingDemoTenant(prisma, rawSql);

    console.log('Demo kiraci ve sahip kullanici olusturuluyor...');
    const { user } = await auth.register({
      tenantName: DEMO_TENANT_NAME,
      name: DEMO_NAME,
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
    });
    // slug deterministik degil (createTenantWithUniqueSlug), demo icin sabitle.
    await prisma.tenant.update({
      where: { id: user.tenantId },
      data: { slug: DEMO_TENANT_SLUG },
    });

    for (const plan of sectorPlans()) {
      console.log(`Yukleniyor: ${plan.datasetName}...`);
      const datasetId = await ingestSector(
        ingestProcessor,
        prisma,
        user.tenantId,
        user.id,
        plan,
      );
      const fields = await prisma.datasetField.findMany({
        where: { datasetId },
      });
      const { dashboardName, widgets: widgetPlans } = plan.buildDashboard(
        fields,
        datasetId,
      );

      await TenantContext.run(
        { tenantId: user.tenantId, userId: user.id, roleIds: [] },
        async () => {
          const dashboard = await dashboards.create(user.tenantId, user.id, {
            name: dashboardName,
          });

          const layout: {
            widgetId: string;
            x: number;
            y: number;
            w: number;
            h: number;
          }[] = [];
          const positions = [
            { x: 0, y: 0, w: 3, h: 2 },
            { x: 3, y: 0, w: 5, h: 4 },
            { x: 0, y: 2, w: 3, h: 4 },
            { x: 8, y: 0, w: 4, h: 4 },
          ];
          for (let i = 0; i < widgetPlans.length; i++) {
            const widgetPlan = widgetPlans[i]!;
            const position = positions[i] ?? { x: 0, y: 6, w: 4, h: 4 };
            const widget = await widgets.create(dashboard.id, {
              type: widgetPlan.type,
              title: widgetPlan.title,
              querySpec: widgetPlan.querySpec,
              vizOptions: {},
              position,
            });
            layout.push({ widgetId: widget.id, ...position });
          }

          await dashboards.update(dashboard.id, { layout });
        },
      );
      console.log(`  -> ${dashboardName} olusturuldu.`);
    }

    console.log('');
    console.log('Demo kiraci hazir.');
    console.log(`  Giris: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  } finally {
    await app.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Demo seed basarisiz oldu:', err);
    process.exit(1);
  });
