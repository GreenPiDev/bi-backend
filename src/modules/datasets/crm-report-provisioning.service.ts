import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';

interface CrmReportFieldSeed {
  sourceName: string;
  name: string;
  label: string;
  type: 'STRING' | 'NUMBER' | 'DATE' | 'BOOLEAN';
  role: 'DIMENSION' | 'MEASURE' | 'DATE';
  isVisible?: boolean;
}

interface CrmReportDatasetSeed {
  physicalTable: string;
  name: string;
  fields: readonly CrmReportFieldSeed[];
}

/**
 * Chatbot'un (ve /datasets'in) sorgulayabileceği tüm sentetik CRM rapor dataset'leri
 * - her biri paylaşımlı şemadaki bir Postgres view'ına (bkz. prisma/migrations/
 * 20260907060349_add_crm_report_dataset_source_kind ve 20261023120359_add_crm_entity_report_views)
 * karşılık gelir. "id" alanları her zaman gizli (isVisible:false) tutulur - sadece
 * `{field:'id', agg:'count'}` ile satır/kayıt sayısı sorgulamak için var, kullanıcıya
 * görünen bir kolon değil (bkz. crm_quote_line_report'taki quoteId ile aynı desen).
 */
const CRM_REPORT_DATASETS: readonly CrmReportDatasetSeed[] = [
  {
    physicalTable: 'crm_quote_line_report',
    name: 'Teklif Satır Raporu',
    fields: [
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
    ],
  },
  {
    physicalTable: 'crm_account_report',
    name: 'Firma Raporu',
    fields: [
      {
        sourceName: 'id',
        name: 'id',
        label: 'Firma Id',
        type: 'STRING',
        role: 'DIMENSION',
        isVisible: false,
      },
      {
        sourceName: 'accountName',
        name: 'accountName',
        label: 'Firma',
        type: 'STRING',
        role: 'DIMENSION',
      },
      {
        sourceName: 'sector',
        name: 'sector',
        label: 'Sektör',
        type: 'STRING',
        role: 'DIMENSION',
      },
      {
        sourceName: 'isCustomer',
        name: 'isCustomer',
        label: 'Müşteri mi',
        type: 'BOOLEAN',
        role: 'DIMENSION',
      },
      {
        sourceName: 'isSupplier',
        name: 'isSupplier',
        label: 'Tedarikçi mi',
        type: 'BOOLEAN',
        role: 'DIMENSION',
      },
      {
        sourceName: 'city',
        name: 'city',
        label: 'Şehir',
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
    ],
  },
  {
    physicalTable: 'crm_contact_report',
    name: 'Kişi Raporu',
    fields: [
      {
        sourceName: 'id',
        name: 'id',
        label: 'Kişi Id',
        type: 'STRING',
        role: 'DIMENSION',
        isVisible: false,
      },
      {
        sourceName: 'contactName',
        name: 'contactName',
        label: 'Kişi',
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
        sourceName: 'status',
        name: 'status',
        label: 'Durum',
        type: 'STRING',
        role: 'DIMENSION',
      },
      {
        sourceName: 'lastContactedAt',
        name: 'lastContactedAt',
        label: 'Son İletişim Tarihi',
        type: 'DATE',
        role: 'DATE',
      },
      {
        sourceName: 'createdAt',
        name: 'createdAt',
        label: 'Oluşturma Tarihi',
        type: 'DATE',
        role: 'DATE',
      },
    ],
  },
  {
    physicalTable: 'crm_interaction_report',
    name: 'Görüşme Raporu',
    fields: [
      {
        sourceName: 'id',
        name: 'id',
        label: 'Görüşme Id',
        type: 'STRING',
        role: 'DIMENSION',
        isVisible: false,
      },
      {
        sourceName: 'accountName',
        name: 'accountName',
        label: 'Firma',
        type: 'STRING',
        role: 'DIMENSION',
      },
      {
        sourceName: 'contactName',
        name: 'contactName',
        label: 'Kişi',
        type: 'STRING',
        role: 'DIMENSION',
      },
      {
        sourceName: 'type',
        name: 'type',
        label: 'Görüşme Şekli',
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
        sourceName: 'occurredAt',
        name: 'occurredAt',
        label: 'Görüşme Tarihi',
        type: 'DATE',
        role: 'DATE',
      },
      {
        sourceName: 'createdByName',
        name: 'createdByName',
        label: 'Oluşturan',
        type: 'STRING',
        role: 'DIMENSION',
      },
    ],
  },
  {
    physicalTable: 'crm_opportunity_report',
    name: 'Fırsat Raporu',
    fields: [
      {
        sourceName: 'id',
        name: 'id',
        label: 'Fırsat Id',
        type: 'STRING',
        role: 'DIMENSION',
        isVisible: false,
      },
      {
        sourceName: 'accountName',
        name: 'accountName',
        label: 'Firma',
        type: 'STRING',
        role: 'DIMENSION',
      },
      {
        sourceName: 'opportunityName',
        name: 'opportunityName',
        label: 'Fırsat',
        type: 'STRING',
        role: 'DIMENSION',
      },
      {
        sourceName: 'stage',
        name: 'stage',
        label: 'Aşama',
        type: 'STRING',
        role: 'DIMENSION',
      },
      {
        sourceName: 'estimatedValue',
        name: 'estimatedValue',
        label: 'Tahmini Değer',
        type: 'NUMBER',
        role: 'MEASURE',
      },
      {
        sourceName: 'createdAt',
        name: 'createdAt',
        label: 'Oluşturma Tarihi',
        type: 'DATE',
        role: 'DATE',
      },
    ],
  },
  {
    physicalTable: 'crm_project_report',
    name: 'Proje Raporu',
    fields: [
      {
        sourceName: 'id',
        name: 'id',
        label: 'Proje Id',
        type: 'STRING',
        role: 'DIMENSION',
        isVisible: false,
      },
      {
        sourceName: 'projectNumber',
        name: 'projectNumber',
        label: 'Proje No',
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
        sourceName: 'projectName',
        name: 'projectName',
        label: 'Proje',
        type: 'STRING',
        role: 'DIMENSION',
      },
      {
        sourceName: 'estimatedBudget',
        name: 'estimatedBudget',
        label: 'Tahmini Bütçe',
        type: 'NUMBER',
        role: 'MEASURE',
      },
      {
        sourceName: 'actualCost',
        name: 'actualCost',
        label: 'Gerçekleşen Maliyet',
        type: 'NUMBER',
        role: 'MEASURE',
      },
      {
        sourceName: 'createdAt',
        name: 'createdAt',
        label: 'Oluşturma Tarihi',
        type: 'DATE',
        role: 'DATE',
      },
    ],
  },
  {
    physicalTable: 'crm_sales_order_report',
    name: 'Satış Siparişi Raporu',
    fields: [
      {
        sourceName: 'id',
        name: 'id',
        label: 'Sipariş Id',
        type: 'STRING',
        role: 'DIMENSION',
        isVisible: false,
      },
      {
        sourceName: 'orderNumber',
        name: 'orderNumber',
        label: 'Sipariş No',
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
        sourceName: 'status',
        name: 'status',
        label: 'Durum',
        type: 'STRING',
        role: 'DIMENSION',
      },
      {
        sourceName: 'totalAmount',
        name: 'totalAmount',
        label: 'Toplam Tutar',
        type: 'NUMBER',
        role: 'MEASURE',
      },
      {
        sourceName: 'createdAt',
        name: 'createdAt',
        label: 'Oluşturma Tarihi',
        type: 'DATE',
        role: 'DATE',
      },
    ],
  },
  {
    physicalTable: 'crm_purchase_order_report',
    name: 'Satın Alma Siparişi Raporu',
    fields: [
      {
        sourceName: 'id',
        name: 'id',
        label: 'Sipariş Id',
        type: 'STRING',
        role: 'DIMENSION',
        isVisible: false,
      },
      {
        sourceName: 'orderNumber',
        name: 'orderNumber',
        label: 'Sipariş No',
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
    ],
  },
  {
    physicalTable: 'crm_stock_report',
    name: 'Stok Raporu',
    fields: [
      {
        sourceName: 'id',
        name: 'id',
        label: 'Stok Kaydı Id',
        type: 'STRING',
        role: 'DIMENSION',
        isVisible: false,
      },
      {
        sourceName: 'productName',
        name: 'productName',
        label: 'Ürün',
        type: 'STRING',
        role: 'DIMENSION',
      },
      {
        sourceName: 'warehouseName',
        name: 'warehouseName',
        label: 'Depo',
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
        sourceName: 'minStockLevel',
        name: 'minStockLevel',
        label: 'Minimum Stok Seviyesi',
        type: 'NUMBER',
        role: 'MEASURE',
      },
      {
        sourceName: 'avgCost',
        name: 'avgCost',
        label: 'Ortalama Maliyet',
        type: 'NUMBER',
        role: 'MEASURE',
      },
    ],
  },
  {
    physicalTable: 'crm_product_report',
    name: 'Ürün Raporu',
    fields: [
      {
        sourceName: 'id',
        name: 'id',
        label: 'Ürün Id',
        type: 'STRING',
        role: 'DIMENSION',
        isVisible: false,
      },
      {
        sourceName: 'productName',
        name: 'productName',
        label: 'Ürün',
        type: 'STRING',
        role: 'DIMENSION',
      },
      {
        sourceName: 'category',
        name: 'category',
        label: 'Kategori',
        type: 'STRING',
        role: 'DIMENSION',
      },
      {
        sourceName: 'brand',
        name: 'brand',
        label: 'Marka',
        type: 'STRING',
        role: 'DIMENSION',
      },
      {
        sourceName: 'price',
        name: 'price',
        label: 'Satış Fiyatı',
        type: 'NUMBER',
        role: 'MEASURE',
      },
      {
        sourceName: 'avgCost',
        name: 'avgCost',
        label: 'Ortalama Maliyet',
        type: 'NUMBER',
        role: 'MEASURE',
      },
      {
        sourceName: 'currency',
        name: 'currency',
        label: 'Para Birimi',
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
    ],
  },
];

/**
 * Faz 11f'nin (bkz. docs/VARSAYIMLAR.md V29/V75) tasarladığı ama hiç
 * `PlatformAdminService.setTenantModule`'e bağlanmamış halde kalan CRM rapor dataset'i
 * provisioning'i - V75'te düzeltilip, kullanıcı talebiyle (chatbot'un sadece tekliflere
 * değil tüm CRM varlıklarına erişebilmesi) `crm_quote_line_report` dışındaki 9 view'a
 * genişletildi (CRM_REPORT_DATASETS, veri-güdümlü tek liste - yeni bir CRM view'ı
 * eklemek artık burada tek satır demek). Sentetik/yeniden üretilebilir oldukları için
 * (gerçek kullanıcı verisi değil) `drawings` modülündeki kütüphane/şablon
 * provisioning'inin aksine, `crm` modülü kapatılınca TÜMÜ kaldırılıyor
 * (deprovisionForTenant) - aksi halde kapalı bir modülün datası sorgulanabilir kalırdı.
 */
@Injectable()
export class CrmReportProvisioningService {
  constructor(private readonly prisma: PrismaService) {}

  async provisionForTenant(tenantId: string): Promise<void> {
    for (const seed of CRM_REPORT_DATASETS) {
      await this.provisionOne(tenantId, seed);
    }
  }

  async deprovisionForTenant(tenantId: string): Promise<void> {
    for (const seed of CRM_REPORT_DATASETS) {
      await this.deprovisionOne(tenantId, seed);
    }
  }

  private async provisionOne(
    tenantId: string,
    seed: CrmReportDatasetSeed,
  ): Promise<void> {
    const existing = await this.prisma.dataset.findFirst({
      where: {
        tenantId,
        sourceKind: 'CRM_TABLE',
        physicalTable: seed.physicalTable,
      },
    });
    if (existing) {
      return;
    }

    await this.prisma.dataset.create({
      data: {
        tenantId,
        name: seed.name,
        physicalTable: seed.physicalTable,
        sourceKind: 'CRM_TABLE',
        fields: {
          create: seed.fields.map((field, index) => ({
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

  private async deprovisionOne(
    tenantId: string,
    seed: CrmReportDatasetSeed,
  ): Promise<void> {
    const existing = await this.prisma.dataset.findFirst({
      where: {
        tenantId,
        sourceKind: 'CRM_TABLE',
        physicalTable: seed.physicalTable,
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
