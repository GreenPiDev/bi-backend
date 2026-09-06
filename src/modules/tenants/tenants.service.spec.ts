import { AppException } from '../../core/errors/app.exception';
import { PageModulesService } from '../../core/modules/page-modules.service';
import { TenantsService } from './tenants.service';

function createPrisma() {
  return {
    tenantModule: {
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn(),
    },
  };
}

function createPageModules(
  assignments: { pageKey: string; label: string; moduleKeys: string[] }[] = [],
) {
  return {
    listAssignments: vi.fn().mockResolvedValue(assignments),
  } as unknown as PageModulesService;
}

describe('TenantsService modulleri', () => {
  it('listModules: core her zaman enabled=true doner, DB kaydi olmasa da', async () => {
    const prisma = createPrisma();
    const service = new TenantsService(prisma as never, createPageModules());
    const modules = await service.listModules('t1');
    expect(modules).toEqual([
      { key: 'core', label: 'Cekirdek', alwaysOn: true, enabled: true },
      {
        key: 'analytics',
        label: 'Veri Analitigi',
        alwaysOn: false,
        enabled: false,
      },
      { key: 'crm', label: 'Satis (CRM)', alwaysOn: false, enabled: false },
    ]);
  });

  it('enableModule: bilinmeyen modul icin UNKNOWN_MODULE firlatir', async () => {
    const prisma = createPrisma();
    const service = new TenantsService(prisma as never, createPageModules());
    await expect(
      service.enableModule('t1', 'yok-boyle-modul'),
    ).rejects.toMatchObject({
      code: 'UNKNOWN_MODULE',
    } satisfies Partial<AppException>);
  });

  it('disableModule: alwaysOn modul icin MODULE_ALWAYS_ON firlatir', async () => {
    const prisma = createPrisma();
    const service = new TenantsService(prisma as never, createPageModules());
    await expect(service.disableModule('t1', 'core')).rejects.toMatchObject({
      code: 'MODULE_ALWAYS_ON',
    } satisfies Partial<AppException>);
    expect(prisma.tenantModule.upsert).not.toHaveBeenCalled();
  });
});

describe('TenantsService.listPageAccess', () => {
  it('moduleKeys bos olan sayfa her zaman accessible=true doner', async () => {
    const prisma = createPrisma();
    const pageModules = createPageModules([
      { pageKey: 'dashboards', label: 'Panolar', moduleKeys: [] },
    ]);
    const service = new TenantsService(prisma as never, pageModules);
    const access = await service.listPageAccess('t1');
    expect(access).toEqual([
      { pageKey: 'dashboards', moduleKeys: [], accessible: true },
    ]);
  });

  it('moduleKeys atanmis ama tenant hicbirine sahip degilse accessible=false doner', async () => {
    const prisma = createPrisma();
    const pageModules = createPageModules([
      { pageKey: 'accounts', label: 'Firmalar', moduleKeys: ['crm'] },
    ]);
    const service = new TenantsService(prisma as never, pageModules);
    const access = await service.listPageAccess('t1');
    expect(access).toEqual([
      { pageKey: 'accounts', moduleKeys: ['crm'], accessible: false },
    ]);
  });

  it('moduleKeys atanmis ve tenant modullerden birine sahipse accessible=true doner', async () => {
    const prisma = createPrisma();
    prisma.tenantModule.findMany.mockResolvedValue([{ moduleKey: 'crm' }]);
    const pageModules = createPageModules([
      { pageKey: 'accounts', label: 'Firmalar', moduleKeys: ['crm'] },
    ]);
    const service = new TenantsService(prisma as never, pageModules);
    const access = await service.listPageAccess('t1');
    expect(access).toEqual([
      { pageKey: 'accounts', moduleKeys: ['crm'], accessible: true },
    ]);
  });

  it('birden fazla moduleKey atanmisken sadece BIRINE sahip olmak yeterli (OR mantigi)', async () => {
    const prisma = createPrisma();
    prisma.tenantModule.findMany.mockResolvedValue([{ moduleKey: 'crm' }]);
    const pageModules = createPageModules([
      { pageKey: 'accounts', label: 'Firmalar', moduleKeys: ['stok', 'crm'] },
    ]);
    const service = new TenantsService(prisma as never, pageModules);
    const access = await service.listPageAccess('t1');
    expect(access[0].accessible).toBe(true);
  });
});
