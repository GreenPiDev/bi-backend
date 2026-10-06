import { DrawingTemplatesProvisioningService } from './drawing-templates-provisioning.service';

const TENANT_ID = 't1';

function createPrisma(existing: unknown = null) {
  return {
    drawingPanelTemplate: {
      findFirst: vi.fn().mockResolvedValue(existing),
      create: vi.fn().mockResolvedValue({ id: 'tpl1' }),
    },
  };
}

describe('DrawingTemplatesProvisioningService', () => {
  it('provisionForTenant: hic kayit yoksa built-in sablonlari (AG + OG) kopyalar', async () => {
    const prisma = createPrisma(null);
    const service = new DrawingTemplatesProvisioningService(prisma as never);

    await service.provisionForTenant(TENANT_ID);

    expect(prisma.drawingPanelTemplate.create).toHaveBeenCalledTimes(2);
    const calls = prisma.drawingPanelTemplate.create.mock.calls as Array<
      [
        {
          data: {
            tenantId: string;
            isBuiltIn: boolean;
            type: string;
            widthMm: number;
          };
        },
      ]
    >;
    for (const [{ data }] of calls) {
      expect(data.tenantId).toBe(TENANT_ID);
      expect(data.isBuiltIn).toBe(true);
    }
    expect(calls[0]![0].data.type).toBe('AG_BACKPLATE');
    expect(calls[0]![0].data.widthMm).toBe(1000);
    expect(calls[1]![0].data.type).toBe('OG_CELL');
    expect(calls[1]![0].data.widthMm).toBe(800);
  });

  it('provisionForTenant: built-in sablon zaten varsa tekrar olusturmaz (idempotent)', async () => {
    const prisma = createPrisma({ id: 'existing' });
    const service = new DrawingTemplatesProvisioningService(prisma as never);

    await service.provisionForTenant(TENANT_ID);

    expect(prisma.drawingPanelTemplate.create).not.toHaveBeenCalled();
  });
});
