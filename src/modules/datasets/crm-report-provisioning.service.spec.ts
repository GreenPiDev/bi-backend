import { CrmReportProvisioningService } from './crm-report-provisioning.service';

const TENANT_ID = 't1';

function createPrisma(existingDataset: unknown = null) {
  const dataset = {
    findFirst: vi.fn().mockResolvedValue(existingDataset),
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ id: 'ds1' }),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
  };
  const datasetField = {
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
  };
  return {
    dataset,
    datasetField,
    $transaction: vi.fn((ops: unknown[]) => Promise.all(ops)),
  };
}

describe('CrmReportProvisioningService', () => {
  it('provisionForTenant: dataset yoksa Dataset + DatasetField satirlarini olusturur', async () => {
    const prisma = createPrisma(null);
    const service = new CrmReportProvisioningService(prisma as never);

    await service.provisionForTenant(TENANT_ID);

    expect(prisma.dataset.create).toHaveBeenCalledTimes(1);
    const createArg = prisma.dataset.create.mock.calls[0]![0] as {
      data: {
        tenantId: string;
        sourceKind: string;
        physicalTable: string;
        dataSourceId: null;
        fields: { create: unknown[] };
      };
    };
    expect(createArg.data.tenantId).toBe(TENANT_ID);
    expect(createArg.data.sourceKind).toBe('CRM_TABLE');
    expect(createArg.data.physicalTable).toBe('crm_quote_line_report');
    expect(createArg.data.dataSourceId).toBeNull();
    expect(createArg.data.fields.create.length).toBeGreaterThan(0);
  });

  it('provisionForTenant: dataset zaten varsa tekrar olusturmaz (idempotent)', async () => {
    const prisma = createPrisma({ id: 'existing-ds' });
    const service = new CrmReportProvisioningService(prisma as never);

    await service.provisionForTenant(TENANT_ID);

    expect(prisma.dataset.create).not.toHaveBeenCalled();
  });

  it('deprovisionForTenant: CRM_TABLE dataset ve alanlarini siler', async () => {
    const prisma = createPrisma();
    prisma.dataset.findMany.mockResolvedValue([{ id: 'ds1' }]);
    const service = new CrmReportProvisioningService(prisma as never);

    await service.deprovisionForTenant(TENANT_ID);

    expect(prisma.datasetField.deleteMany).toHaveBeenCalledWith({
      where: { datasetId: { in: ['ds1'] } },
    });
    expect(prisma.dataset.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['ds1'] } },
    });
  });

  it('deprovisionForTenant: hic CRM dataset yoksa hicbir sey yapmaz', async () => {
    const prisma = createPrisma();
    prisma.dataset.findMany.mockResolvedValue([]);
    const service = new CrmReportProvisioningService(prisma as never);

    await service.deprovisionForTenant(TENANT_ID);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
