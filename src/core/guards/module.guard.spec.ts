import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { AppException } from '../errors/app.exception';
import { MODULE_KEY } from '../decorators/requires-module.decorator';
import { MODULE_PAGE_KEY } from '../decorators/module-page.decorator';
import { PERMISSION_KEY } from '../decorators/requires-permission.decorator';
import { PageModulesService } from '../modules/page-modules.service';
import { ModuleGuard } from './module.guard';

function createContext(user?: { tenantId: string }) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => vi.fn(),
    getClass: () => vi.fn(),
  } as unknown as ExecutionContext;
}

function createReflector(metadataByKey: Record<string, unknown>) {
  return {
    getAllAndOverride: vi.fn((key: string) => metadataByKey[key]),
  } as unknown as Reflector;
}

function createPageModules(moduleKeysByPage: Record<string, string[]> = {}) {
  return {
    getModuleKeysForPage: vi.fn((pageKey: string) =>
      Promise.resolve(moduleKeysByPage[pageKey] ?? []),
    ),
  } as unknown as PageModulesService;
}

describe('ModuleGuard - legacy @RequiresModule (literal moduleKey)', () => {
  it('metadata yoksa gecer', async () => {
    const prisma = { tenantModule: { findFirst: vi.fn() } };
    const guard = new ModuleGuard(
      createReflector({}),
      prisma as never,
      createPageModules(),
    );
    await expect(
      guard.canActivate(createContext({ tenantId: 't1' })),
    ).resolves.toBe(true);
    expect(prisma.tenantModule.findFirst).not.toHaveBeenCalled();
  });

  it('alwaysOn modul icin DB sorgusu yapmadan gecer', async () => {
    const prisma = { tenantModule: { findFirst: vi.fn() } };
    const guard = new ModuleGuard(
      createReflector({ [MODULE_KEY]: ['core'] }),
      prisma as never,
      createPageModules(),
    );
    await expect(
      guard.canActivate(createContext({ tenantId: 't1' })),
    ).resolves.toBe(true);
    expect(prisma.tenantModule.findFirst).not.toHaveBeenCalled();
  });

  it('kayitli olmayan modul icin tenant kaydi yoksa MODULE_NOT_ENABLED firlatir', async () => {
    const prisma = {
      tenantModule: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const guard = new ModuleGuard(
      createReflector({ [MODULE_KEY]: ['sales'] }),
      prisma as never,
      createPageModules(),
    );
    await expect(
      guard.canActivate(createContext({ tenantId: 't1' })),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('tenant icin aktif kaydi varsa gecer', async () => {
    const prisma = {
      tenantModule: { findFirst: vi.fn().mockResolvedValue({ id: 'tm1' }) },
    };
    const guard = new ModuleGuard(
      createReflector({ [MODULE_KEY]: ['sales'] }),
      prisma as never,
      createPageModules(),
    );
    await expect(
      guard.canActivate(createContext({ tenantId: 't1' })),
    ).resolves.toBe(true);
    expect(prisma.tenantModule.findFirst).toHaveBeenCalledWith({
      where: { tenantId: 't1', moduleKey: { in: ['sales'] }, disabledAt: null },
    });
  });

  it('kullanici yoksa FORBIDDEN firlatir', async () => {
    const prisma = { tenantModule: { findFirst: vi.fn() } };
    const guard = new ModuleGuard(
      createReflector({ [MODULE_KEY]: ['sales'] }),
      prisma as never,
      createPageModules(),
    );
    await expect(
      guard.canActivate(createContext(undefined)),
    ).rejects.toBeInstanceOf(AppException);
  });
});

describe('ModuleGuard - dinamik pageKey (PageModuleAssignment)', () => {
  it('pageKey cozumlenemezse (ne ModulePage ne RequiresPermission) gecer', async () => {
    const prisma = { tenantModule: { findFirst: vi.fn() } };
    const pageModules = createPageModules();
    const guard = new ModuleGuard(
      createReflector({}),
      prisma as never,
      pageModules,
    );
    await expect(
      guard.canActivate(createContext({ tenantId: 't1' })),
    ).resolves.toBe(true);
    expect(pageModules.getModuleKeysForPage).not.toHaveBeenCalled();
  });

  it('@ModulePage ile pageKey verilmisse ve sayfaya hic modul atanmamissa gecer', async () => {
    const prisma = { tenantModule: { findFirst: vi.fn() } };
    const pageModules = createPageModules({ accounts: [] });
    const guard = new ModuleGuard(
      createReflector({ [MODULE_PAGE_KEY]: 'accounts' }),
      prisma as never,
      pageModules,
    );
    await expect(
      guard.canActivate(createContext({ tenantId: 't1' })),
    ).resolves.toBe(true);
    expect(prisma.tenantModule.findFirst).not.toHaveBeenCalled();
  });

  it('@RequiresPermission fallback: pageKey oradan okunur, atanan modul kapaliysa MODULE_NOT_ENABLED', async () => {
    const prisma = {
      tenantModule: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const pageModules = createPageModules({ accounts: ['crm'] });
    const guard = new ModuleGuard(
      createReflector({
        [PERMISSION_KEY]: { pageKey: 'accounts', action: 'CREATE' },
      }),
      prisma as never,
      pageModules,
    );
    await expect(
      guard.canActivate(createContext({ tenantId: 't1' })),
    ).rejects.toMatchObject({
      code: 'MODULE_NOT_ENABLED',
    } satisfies Partial<AppException>);
  });

  it('atanan modullerden biri aciksa gecer (OR mantigi, coklu modul)', async () => {
    const prisma = {
      tenantModule: { findFirst: vi.fn().mockResolvedValue({ id: 'tm1' }) },
    };
    const pageModules = createPageModules({ accounts: ['stok', 'crm'] });
    const guard = new ModuleGuard(
      createReflector({ [MODULE_PAGE_KEY]: 'accounts' }),
      prisma as never,
      pageModules,
    );
    await expect(
      guard.canActivate(createContext({ tenantId: 't1' })),
    ).resolves.toBe(true);
    expect(prisma.tenantModule.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: 't1',
        moduleKey: { in: ['stok', 'crm'] },
        disabledAt: null,
      },
    });
  });

  it('atanan modullerden biri alwaysOn ise DB sorgusu yapmadan gecer', async () => {
    const prisma = { tenantModule: { findFirst: vi.fn() } };
    const pageModules = createPageModules({ dashboards: ['core'] });
    const guard = new ModuleGuard(
      createReflector({ [MODULE_PAGE_KEY]: 'dashboards' }),
      prisma as never,
      pageModules,
    );
    await expect(
      guard.canActivate(createContext({ tenantId: 't1' })),
    ).resolves.toBe(true);
    expect(prisma.tenantModule.findFirst).not.toHaveBeenCalled();
  });

  it('kullanici yoksa FORBIDDEN firlatir', async () => {
    const prisma = { tenantModule: { findFirst: vi.fn() } };
    const pageModules = createPageModules({ accounts: ['crm'] });
    const guard = new ModuleGuard(
      createReflector({ [MODULE_PAGE_KEY]: 'accounts' }),
      prisma as never,
      pageModules,
    );
    await expect(
      guard.canActivate(createContext(undefined)),
    ).rejects.toBeInstanceOf(AppException);
  });
});
