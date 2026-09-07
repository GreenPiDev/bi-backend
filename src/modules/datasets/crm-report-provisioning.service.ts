import { Injectable } from '@nestjs/common';
import type { DatasetFieldRole, DatasetFieldType } from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';

interface CrmReportFieldSeed {
  sourceName: string;
  name: string;
  label: string;
  type: DatasetFieldType;
  role: DatasetFieldRole;
}

interface CrmReportDatasetSeed {
  physicalTable: string;
  name: string;
  fields: CrmReportFieldSeed[];
}

/**
 * Faz 11f (R1-R2, bkz. docs/VARSAYIMLAR.md V29): `crm` modulu acilan her tenant icin
 * saglanan sentetik rapor dataset'leri. Fiziksel karsiliklari prisma/migrations altinda
 * elle eklenen Postgres view'lari (bkz. crm_quote_line_report migration'i) - yeni bir
 * CRM rapor dataset'i eklemek icin buraya tek bir giris eklemek yeterli.
 */
const CRM_REPORT_DATASETS: readonly CrmReportDatasetSeed[] = [
  {
    physicalTable: 'crm_quote_line_report',
    name: 'Satış Raporu (CRM)',
    fields: [
      {
        sourceName: 'quoteNumber',
        name: 'quoteNumber',
        label: 'Teklif No',
        type: 'STRING',
        role: 'DIMENSION',
      },
      {
        sourceName: 'status',
        name: 'status',
        label: 'Durum',
        type: 'STRING',
        role: 'DIMENSION',
      },
      {
        sourceName: 'accountName',
        name: 'accountName',
        label: 'Firma',
        type: 'STRING',
        role: 'DIMENSION',
      },
      {
        sourceName: 'salesRepName',
        name: 'salesRepName',
        label: 'Satışçı',
        type: 'STRING',
        role: 'DIMENSION',
      },
      {
        sourceName: 'productName',
        name: 'productName',
        label: 'Ürün',
        type: 'STRING',
        role: 'DIMENSION',
      },
      {
        sourceName: 'createdAt',
        name: 'createdAt',
        label: 'Oluşturulma Tarihi',
        type: 'DATE',
        role: 'DATE',
      },
      {
        sourceName: 'approvedAt',
        name: 'approvedAt',
        label: 'Onay Tarihi',
        type: 'DATE',
        role: 'DATE',
      },
      {
        sourceName: 'quantity',
        name: 'quantity',
        label: 'Adet',
        type: 'NUMBER',
        role: 'MEASURE',
      },
      {
        sourceName: 'lineTotal',
        name: 'lineTotal',
        label: 'Satır Tutarı (₺)',
        type: 'NUMBER',
        role: 'MEASURE',
      },
    ],
  },
];

@Injectable()
export class CrmReportProvisioningService {
  constructor(private readonly prisma: PrismaService) {}

  async provisionForTenant(tenantId: string): Promise<void> {
    for (const seed of CRM_REPORT_DATASETS) {
      const existing = await this.prisma.dataset.findFirst({
        where: {
          tenantId,
          sourceKind: 'CRM_TABLE',
          physicalTable: seed.physicalTable,
        },
      });
      if (existing) {
        continue;
      }

      await this.prisma.$transaction([
        this.prisma.dataset.create({
          data: {
            tenantId,
            name: seed.name,
            physicalTable: seed.physicalTable,
            sourceKind: 'CRM_TABLE',
            dataSourceId: null,
            fields: {
              create: seed.fields.map((field, index) => ({
                sourceName: field.sourceName,
                name: field.name,
                label: field.label,
                type: field.type,
                role: field.role,
                ordinal: index,
              })),
            },
          },
        }),
      ]);
    }
  }

  async deprovisionForTenant(tenantId: string): Promise<void> {
    const datasets = await this.prisma.dataset.findMany({
      where: { tenantId, sourceKind: 'CRM_TABLE' },
      select: { id: true },
    });
    if (datasets.length === 0) {
      return;
    }
    const datasetIds = datasets.map((d) => d.id);
    await this.prisma.$transaction([
      this.prisma.datasetField.deleteMany({
        where: { datasetId: { in: datasetIds } },
      }),
      this.prisma.dataset.deleteMany({
        where: { id: { in: datasetIds } },
      }),
    ]);
  }
}
