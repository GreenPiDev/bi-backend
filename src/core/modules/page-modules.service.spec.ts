import { AppException } from '../errors/app.exception';
import { PageModulesService } from './page-modules.service';

function createPrisma() {
  return {
    pageModuleAssignment: {
      findMany: vi.fn().mockResolvedValue([]),
      createMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  };
}

describe('PageModulesService', () => {
  it('listAssignments: eslemesi olmayan sayfalar bos moduleKeys doner', async () => {
    const prisma = createPrisma();
    const service = new PageModulesService(prisma as never);
    const assignments = await service.listAssignments();
    const dashboards = assignments.find((a) => a.pageKey === 'dashboards');
    expect(dashboards).toEqual({
      pageKey: 'dashboards',
      label: 'Panolar',
      moduleKeys: [],
    });
  });

  it('listAssignments: bir sayfa birden fazla modulde olabilir', async () => {
    const prisma = createPrisma();
    prisma.pageModuleAssignment.findMany.mockResolvedValue([
      { pageKey: 'accounts', moduleKey: 'crm' },
      { pageKey: 'accounts', moduleKey: 'core' },
    ]);
    const service = new PageModulesService(prisma as never);
    const assignments = await service.listAssignments();
    const accounts = assignments.find((a) => a.pageKey === 'accounts');
    expect(accounts).toEqual({
      pageKey: 'accounts',
      label: 'Firmalar',
      moduleKeys: ['crm', 'core'],
    });
  });

  it('setAssignment: bilinmeyen pageKey icin UNKNOWN_PAGE firlatir', async () => {
    const prisma = createPrisma();
    const service = new PageModulesService(prisma as never);
    await expect(
      service.setAssignment('yok-boyle-sayfa', ['crm']),
    ).rejects.toMatchObject({
      code: 'UNKNOWN_PAGE',
    } satisfies Partial<AppException>);
    expect(prisma.pageModuleAssignment.deleteMany).not.toHaveBeenCalled();
  });

  it('setAssignment: bilinmeyen moduleKey icin UNKNOWN_MODULE firlatir', async () => {
    const prisma = createPrisma();
    const service = new PageModulesService(prisma as never);
    await expect(
      service.setAssignment('accounts', ['yok-boyle-modul']),
    ).rejects.toMatchObject({
      code: 'UNKNOWN_MODULE',
    } satisfies Partial<AppException>);
    expect(prisma.pageModuleAssignment.deleteMany).not.toHaveBeenCalled();
  });

  it('setAssignment: bos dizi icin sadece mevcut kayitlari siler', async () => {
    const prisma = createPrisma();
    const service = new PageModulesService(prisma as never);
    await service.setAssignment('accounts', []);
    expect(prisma.pageModuleAssignment.deleteMany).toHaveBeenCalledWith({
      where: { pageKey: 'accounts' },
    });
    expect(prisma.pageModuleAssignment.createMany).not.toHaveBeenCalled();
  });

  it('setAssignment: mevcut kayitlari silip yeni listeyi yazar (tekrarlari eler)', async () => {
    const prisma = createPrisma();
    const service = new PageModulesService(prisma as never);
    await service.setAssignment('accounts', ['crm', 'core', 'crm']);
    expect(prisma.pageModuleAssignment.deleteMany).toHaveBeenCalledWith({
      where: { pageKey: 'accounts' },
    });
    expect(prisma.pageModuleAssignment.createMany).toHaveBeenCalledWith({
      data: [
        { pageKey: 'accounts', moduleKey: 'crm' },
        { pageKey: 'accounts', moduleKey: 'core' },
      ],
    });
  });
});
