import { CrmReportProvisioningService } from './crm-report-provisioning.service';

const TENANT_ID = 't1';

function createPrisma(existingByTable: Record<string, unknown> = {}) {
  return {
    dataset: {
      findFirst: vi
        .fn()
        .mockImplementation(({ where }: { where: { physicalTable: string } }) =>
          Promise.resolve(existingByTable[where.physicalTable] ?? null),
        ),
      create: vi.fn().mockResolvedValue({ id: 'd1' }),
      delete: vi.fn().mockResolvedValue({ id: 'd1' }),
    },
    datasetField: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
}

describe('CrmReportProvisioningService', () => {
  it('provisionForTenant: hic kayit yoksa tum CRM rapor dataset lerini olusturur', async () => {
    const prisma = createPrisma();
    const service = new CrmReportProvisioningService(prisma as never);

    await service.provisionForTenant(TENANT_ID);

    expect(prisma.dataset.create).toHaveBeenCalledTimes(10);
    const tables = prisma.dataset.create.mock.calls.map(
      (call) =>
        (call[0] as { data: { physicalTable: string } }).data.physicalTable,
    );
    expect(tables).toContain('crm_quote_line_report');
    expect(tables).toContain('crm_account_report');
    expect(tables).toContain('crm_contact_report');
    expect(tables).toContain('crm_interaction_report');
    expect(tables).toContain('crm_opportunity_report');
    expect(tables).toContain('crm_project_report');
    expect(tables).toContain('crm_sales_order_report');
    expect(tables).toContain('crm_purchase_order_report');
    expect(tables).toContain('crm_stock_report');
    expect(tables).toContain('crm_product_report');

    const firstCall = prisma.dataset.create.mock.calls[0]![0] as {
      data: {
        tenantId: string;
        sourceKind: string;
        fields: { create: unknown[] };
      };
    };
    expect(firstCall.data.tenantId).toBe(TENANT_ID);
    expect(firstCall.data.sourceKind).toBe('CRM_TABLE');
    expect(firstCall.data.fields.create.length).toBeGreaterThan(0);
  });

  it('provisionForTenant: zaten var olan dataset ler tekrar olusturulmaz (idempotent)', async () => {
    const prisma = createPrisma({ crm_quote_line_report: { id: 'existing' } });
    const service = new CrmReportProvisioningService(prisma as never);

    await service.provisionForTenant(TENANT_ID);

    expect(prisma.dataset.create).toHaveBeenCalledTimes(9);
    const tables = prisma.dataset.create.mock.calls.map(
      (call) =>
        (call[0] as { data: { physicalTable: string } }).data.physicalTable,
    );
    expect(tables).not.toContain('crm_quote_line_report');
  });

  it('deprovisionForTenant: var olan tum dataset lerin alanlarini ve kendilerini siler', async () => {
    const existingByTable = {
      crm_quote_line_report: { id: 'q1' },
      crm_account_report: { id: 'a1' },
    };
    const prisma = createPrisma(existingByTable);
    const service = new CrmReportProvisioningService(prisma as never);

    await service.deprovisionForTenant(TENANT_ID);

    expect(prisma.datasetField.deleteMany).toHaveBeenCalledWith({
      where: { datasetId: 'q1' },
    });
    expect(prisma.dataset.delete).toHaveBeenCalledWith({ where: { id: 'q1' } });
    expect(prisma.datasetField.deleteMany).toHaveBeenCalledWith({
      where: { datasetId: 'a1' },
    });
    expect(prisma.dataset.delete).toHaveBeenCalledWith({ where: { id: 'a1' } });
  });

  it('deprovisionForTenant: hic dataset yoksa hicbir sey yapmaz', async () => {
    const prisma = createPrisma();
    const service = new CrmReportProvisioningService(prisma as never);

    await service.deprovisionForTenant(TENANT_ID);

    expect(prisma.datasetField.deleteMany).not.toHaveBeenCalled();
    expect(prisma.dataset.delete).not.toHaveBeenCalled();
  });
});
