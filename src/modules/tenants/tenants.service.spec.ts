import { AppException } from '../../core/errors/app.exception';
import { TenantsService } from './tenants.service';

function createPrisma() {
  return {
    tenantModule: {
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn(),
    },
  };
}

describe('TenantsService modulleri', () => {
  it('listModules: core her zaman enabled=true doner, DB kaydi olmasa da', async () => {
    const prisma = createPrisma();
    const service = new TenantsService(prisma as never);
    const modules = await service.listModules('t1');
    expect(modules).toEqual([
      { key: 'core', label: 'Cekirdek', alwaysOn: true, enabled: true },
    ]);
  });

  it('enableModule: bilinmeyen modul icin UNKNOWN_MODULE firlatir', async () => {
    const prisma = createPrisma();
    const service = new TenantsService(prisma as never);
    await expect(
      service.enableModule('t1', 'yok-boyle-modul'),
    ).rejects.toMatchObject({
      code: 'UNKNOWN_MODULE',
    } satisfies Partial<AppException>);
  });

  it('disableModule: alwaysOn modul icin MODULE_ALWAYS_ON firlatir', async () => {
    const prisma = createPrisma();
    const service = new TenantsService(prisma as never);
    await expect(service.disableModule('t1', 'core')).rejects.toMatchObject({
      code: 'MODULE_ALWAYS_ON',
    } satisfies Partial<AppException>);
    expect(prisma.tenantModule.upsert).not.toHaveBeenCalled();
  });
});
