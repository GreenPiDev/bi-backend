import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import type { RequestUser } from '../decorators/current-user.decorator';
import {
  ALLOW_EXPIRED_DEMO_KEY,
  DEMO_RESTRICTED_KEY,
} from '../decorators/demo-access.decorator';
import { DemoAccessGuard } from './demo-access.guard';

function createContext(
  user: Partial<RequestUser> | undefined,
  metadata: Record<string, boolean> = {},
): { guard: DemoAccessGuard; context: ExecutionContext } {
  const handler = () => undefined;
  for (const [key, value] of Object.entries(metadata)) {
    Reflect.defineMetadata(key, value, handler);
  }
  const context = {
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
  return { guard: new DemoAccessGuard(new Reflector()), context };
}

const baseUser = {
  id: 'u1',
  tenantId: 't1',
  roleIds: [],
  isPlatformAdmin: false,
};

describe('DemoAccessGuard', () => {
  it('demo olmayan kullaniciyi hic kisitlamaz', () => {
    const { guard, context } = createContext(baseUser, {
      [DEMO_RESTRICTED_KEY]: true,
    });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('kimliksiz (public) istekte no-op', () => {
    const { guard, context } = createContext(undefined);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('suresi dolmamis demo kullanicisi normal uclara erisir', () => {
    const { guard, context } = createContext({
      ...baseUser,
      isDemoUser: true,
      demoExpiresAt: Date.now() + 60_000,
    });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('suresi dolmus demo kullanicisi DEMO_EXPIRED alir', () => {
    const { guard, context } = createContext({
      ...baseUser,
      isDemoUser: true,
      demoExpiresAt: Date.now() - 1,
    });
    expect(() => guard.canActivate(context)).toThrow(
      expect.objectContaining({ code: 'DEMO_EXPIRED' }),
    );
  });

  it('suresi dolmus demo kullanicisi @AllowExpiredDemo uclarina erisir', () => {
    const { guard, context } = createContext(
      { ...baseUser, isDemoUser: true, demoExpiresAt: Date.now() - 1 },
      { [ALLOW_EXPIRED_DEMO_KEY]: true },
    );
    expect(guard.canActivate(context)).toBe(true);
  });

  it('demo kullanicisi @DemoRestricted uclarda DEMO_RESTRICTED alir', () => {
    const { guard, context } = createContext(
      { ...baseUser, isDemoUser: true, demoExpiresAt: Date.now() + 60_000 },
      { [DEMO_RESTRICTED_KEY]: true },
    );
    expect(() => guard.canActivate(context)).toThrow(
      expect.objectContaining({ code: 'DEMO_RESTRICTED' }),
    );
  });
});
