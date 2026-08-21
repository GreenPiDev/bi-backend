import { TenantContext } from './tenant-context';

describe('TenantContext', () => {
  it('run disisinda get() undefined doner', () => {
    expect(TenantContext.get()).toBeUndefined();
  });

  it('run disisinda getOrThrow() hata firlatir', () => {
    expect(() => TenantContext.getOrThrow()).toThrow('TenantContext disisinda');
  });

  it("run icinde get() dogru store'u doner", () => {
    const store = { tenantId: 't1', userId: 'u1', role: 'OWNER' as const };
    const result = TenantContext.run(store, () => TenantContext.get());
    expect(result).toEqual(store);
  });

  it('ic ice run cagrilari birbirini etkilemez', () => {
    const outer = { tenantId: 'outer', userId: 'u1', role: 'OWNER' as const };
    const inner = { tenantId: 'inner', userId: 'u2', role: 'VIEWER' as const };

    TenantContext.run(outer, () => {
      expect(TenantContext.get()?.tenantId).toBe('outer');
      TenantContext.run(inner, () => {
        expect(TenantContext.get()?.tenantId).toBe('inner');
      });
      expect(TenantContext.get()?.tenantId).toBe('outer');
    });
  });

  it('async callback boyunca context korunur', async () => {
    const store = { tenantId: 't1', userId: 'u1', role: 'ADMIN' as const };
    const result = await TenantContext.run(store, async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      return TenantContext.get()?.tenantId;
    });
    expect(result).toBe('t1');
  });
});
