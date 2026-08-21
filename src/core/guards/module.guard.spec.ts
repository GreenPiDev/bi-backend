import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { AppException } from '../errors/app.exception';
import { ModuleGuard } from './module.guard';

function createContext(user?: { tenantId: string }) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => vi.fn(),
    getClass: () => vi.fn(),
  } as unknown as ExecutionContext;
}

function createReflector(requiredModules: string[] | undefined) {
  return {
    getAllAndOverride: vi.fn().mockReturnValue(requiredModules),
  } as unknown as Reflector;
}

describe('ModuleGuard', () => {
  it('metadata yoksa gecer', async () => {
    const prisma = { tenantModule: { findFirst: vi.fn() } };
    const guard = new ModuleGuard(createReflector(undefined), prisma as never);
    await expect(
      guard.canActivate(createContext({ tenantId: 't1' })),
    ).resolves.toBe(true);
    expect(prisma.tenantModule.findFirst).not.toHaveBeenCalled();
  });

  it('alwaysOn modul icin DB sorgusu yapmadan gecer', async () => {
    const prisma = { tenantModule: { findFirst: vi.fn() } };
    const guard = new ModuleGuard(createReflector(['core']), prisma as never);
    await expect(
      guard.canActivate(createContext({ tenantId: 't1' })),
    ).resolves.toBe(true);
    expect(prisma.tenantModule.findFirst).not.toHaveBeenCalled();
  });

  it('kayitli olmayan modul icin tenant kaydi yoksa MODULE_NOT_ENABLED firlatir', async () => {
    const prisma = {
      tenantModule: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const guard = new ModuleGuard(createReflector(['sales']), prisma as never);
    await expect(
      guard.canActivate(createContext({ tenantId: 't1' })),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('tenant icin aktif kaydi varsa gecer', async () => {
    const prisma = {
      tenantModule: {
        findFirst: vi.fn().mockResolvedValue({ id: 'tm1' }),
      },
    };
    const guard = new ModuleGuard(createReflector(['sales']), prisma as never);
    await expect(
      guard.canActivate(createContext({ tenantId: 't1' })),
    ).resolves.toBe(true);
    expect(prisma.tenantModule.findFirst).toHaveBeenCalledWith({
      where: { tenantId: 't1', moduleKey: 'sales', disabledAt: null },
    });
  });

  it('kullanici yoksa FORBIDDEN firlatir', async () => {
    const prisma = { tenantModule: { findFirst: vi.fn() } };
    const guard = new ModuleGuard(createReflector(['sales']), prisma as never);
    await expect(
      guard.canActivate(createContext(undefined)),
    ).rejects.toBeInstanceOf(AppException);
  });
});
