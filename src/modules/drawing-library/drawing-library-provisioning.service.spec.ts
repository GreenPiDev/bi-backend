import { DrawingLibraryProvisioningService } from './drawing-library-provisioning.service';

const TENANT_ID = 't1';

function createPrisma(existing: unknown = null) {
  return {
    drawingLibraryComponent: {
      findFirst: vi.fn().mockResolvedValue(existing),
      create: vi.fn().mockResolvedValue({ id: 'c1' }),
    },
  };
}

describe('DrawingLibraryProvisioningService', () => {
  it('provisionForTenant: hic kayit yoksa tum built-in komponentleri kopyalar', async () => {
    const prisma = createPrisma(null);
    const service = new DrawingLibraryProvisioningService(prisma as never);

    await service.provisionForTenant(TENANT_ID);

    expect(prisma.drawingLibraryComponent.create).toHaveBeenCalled();
    const firstCallArg = prisma.drawingLibraryComponent.create.mock
      .calls[0]![0] as { data: { tenantId: string; isBuiltIn: boolean } };
    expect(firstCallArg.data.tenantId).toBe(TENANT_ID);
    expect(firstCallArg.data.isBuiltIn).toBe(true);
  });

  it('provisionForTenant: ayni key zaten varsa tekrar olusturmaz (idempotent)', async () => {
    const prisma = createPrisma({ id: 'existing' });
    const service = new DrawingLibraryProvisioningService(prisma as never);

    await service.provisionForTenant(TENANT_ID);

    expect(prisma.drawingLibraryComponent.create).not.toHaveBeenCalled();
  });
});
