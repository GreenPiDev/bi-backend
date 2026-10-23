import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';

const CRM_QUOTE_LINE_REPORT_TABLE = 'crm_quote_line_report';
const CRM_QUOTE_LINE_REPORT_NAME = 'Teklif Satır Raporu';

interface CrmReportFieldSeed {
  sourceName: string;
  name: string;
  label: string;
  type: 'STRING' | 'NUMBER' | 'DATE' | 'BOOLEAN';
  role: 'DIMENSION' | 'MEASURE' | 'DATE';
  isVisible?: boolean;
}

/**
 * `crm_quote_line_report` Postgres view'inin (bkz. prisma/migrations/
 * 20260907060349_add_crm_report_dataset_source_kind) kolonlarini birebir yansitir -
 * "tenantId" burada yok, query-builder.ts zaten her CRM_TABLE sorgusuna zorunlu bir
 * tenantId predicate'i enjekte ediyor (bkz. docs/VARSAYIMLAR.md V29), bu alani
 * sorgulanabilir bir DatasetField olarak gostermeye gerek yok.
 */
const CRM_QUOTE_LINE_REPORT_FIELDS: readonly CrmReportFieldSeed[] = [
  {
    sourceName: 'quoteId',
    name: 'quoteId',
    label: 'Teklif Id',
    type: 'STRING',
    role: 'DIMENSION',
    isVisible: false,
  },
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
    sourceName: 'createdAt',
    name: 'createdAt',
    label: 'Oluşturma Tarihi',
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
    sourceName: 'quantity',
    name: 'quantity',
    label: 'Miktar',
    type: 'NUMBER',
    role: 'MEASURE',
  },
  {
    sourceName: 'lineTotal',
    name: 'lineTotal',
    label: 'Satır Tutarı',
    type: 'NUMBER',
    role: 'MEASURE',
  },
];

/**
 * Faz 11f'nin (bkz. docs/VARSAYIMLAR.md V29) tasarladığı ama hiç `PlatformAdminService.
 * setTenantModule`'e bağlanmamış halde kalan CRM rapor dataset'i provisioning'i. `crm`
 * modülü açıkken bu dataset satırı yoksa (ör. modül bu kod yazılmadan önce açılmış bir
 * tenant), hem `/query` hem chatbot (describe_dataset/run_query) teklif/firma/ürün bazlı
 * sayısal sorulara asla cevap veremiyordu - sentetik, yeniden üretilebilir bir satır
 * olduğu için (gerçek kullanıcı verisi değil) `drawings` modülündeki kütüphane/şablon
 * provisioning'inin aksine, `crm` modülü kapatılınca bu dataset DE kaldırılıyor
 * (deprovisionForTenant) - aksi halde kapalı bir modülün datası sorgulanabilir kalırdı.
 */
@Injectable()
export class CrmReportProvisioningService {
  constructor(private readonly prisma: PrismaService) {}

  async provisionForTenant(tenantId: string): Promise<void> {
    const existing = await this.prisma.dataset.findFirst({
      where: {
        tenantId,
        sourceKind: 'CRM_TABLE',
        physicalTable: CRM_QUOTE_LINE_REPORT_TABLE,
      },
    });
    if (existing) {
      return;
    }

    await this.prisma.dataset.create({
      data: {
        tenantId,
        name: CRM_QUOTE_LINE_REPORT_NAME,
        physicalTable: CRM_QUOTE_LINE_REPORT_TABLE,
        sourceKind: 'CRM_TABLE',
        fields: {
          create: CRM_QUOTE_LINE_REPORT_FIELDS.map((field, index) => ({
            sourceName: field.sourceName,
            name: field.name,
            label: field.label,
            type: field.type,
            role: field.role,
            isVisible: field.isVisible ?? true,
            ordinal: index,
          })),
        },
      },
    });
  }

  async deprovisionForTenant(tenantId: string): Promise<void> {
    const existing = await this.prisma.dataset.findFirst({
      where: {
        tenantId,
        sourceKind: 'CRM_TABLE',
        physicalTable: CRM_QUOTE_LINE_REPORT_TABLE,
      },
    });
    if (!existing) {
      return;
    }
    await this.prisma.datasetField.deleteMany({
      where: { datasetId: existing.id },
    });
    await this.prisma.dataset.delete({ where: { id: existing.id } });
  }
}
