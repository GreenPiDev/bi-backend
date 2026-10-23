import { CrmReportProvisioningService } from './crm-report-provisioning.service';

const TENANT_ID = 't1';

function createPrisma(existing: unknown = null) {
  return {
    dataset: {
      findFirst: vi.fn().mockResolvedValue(existing),
      create: vi.fn().mockResolvedValue({ id: 'd1' }),
      delete: vi.fn().mockResolvedValue({ id: 'd1' }),
    },
    datasetField: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
}

describe('CrmReportProvisioningService', () => {
  it('provisionForTenant: kayit yoksa CRM_TABLE dataset + alanlarini olusturur', async () => {
    const prisma = createPrisma(null);
    const service = new CrmReportProvisioningService(prisma as never);

    await service.provisionForTenant(TENANT_ID);

    expect(prisma.dataset.create).toHaveBeenCalledTimes(1);
    const arg = prisma.dataset.create.mock.calls[0]![0] as {
      data: {
        tenantId: string;
        sourceKind: string;
        physicalTable: string;
        fields: { create: unknown[] };
      };
    };
    expect(arg.data.tenantId).toBe(TENANT_ID);
    expect(arg.data.sourceKind).toBe('CRM_TABLE');
    expect(arg.data.physicalTable).toBe('crm_quote_line_report');
    expect(arg.data.fields.create.length).toBeGreaterThan(0);
  });

  it('provisionForTenant: dataset zaten varsa tekrar olusturmaz (idempotent)', async () => {
    const prisma = createPrisma({ id: 'existing' });
    const service = new CrmReportProvisioningService(prisma as never);

    await service.provisionForTenant(TENANT_ID);

    expect(prisma.dataset.create).not.toHaveBeenCalled();
  });

  it('deprovisionForTenant: dataset varsa alanlarini ve kendisini siler', async () => {
    const prisma = createPrisma({ id: 'existing' });
    const service = new CrmReportProvisioningService(prisma as never);

    await service.deprovisionForTenant(TENANT_ID);

    expect(prisma.datasetField.deleteMany).toHaveBeenCalledWith({
      where: { datasetId: 'existing' },
    });
    expect(prisma.dataset.delete).toHaveBeenCalledWith({
      where: { id: 'existing' },
    });
  });

  it('deprovisionForTenant: dataset yoksa hicbir sey yapmaz', async () => {
    const prisma = createPrisma(null);
    const service = new CrmReportProvisioningService(prisma as never);

    await service.deprovisionForTenant(TENANT_ID);

    expect(prisma.datasetField.deleteMany).not.toHaveBeenCalled();
    expect(prisma.dataset.delete).not.toHaveBeenCalled();
  });
});
