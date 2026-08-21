import { AsyncLocalStorage } from 'node:async_hooks';
import type { UserRole } from '@prisma/client';

export interface TenantStore {
  tenantId: string;
  userId: string;
  role: UserRole;
}

const storage = new AsyncLocalStorage<TenantStore>();

export class TenantContext {
  static run<T>(store: TenantStore, fn: () => T): T {
    return storage.run(store, fn);
  }

  static get(): TenantStore | undefined {
    return storage.getStore();
  }

  static getOrThrow(): TenantStore {
    const store = storage.getStore();
    if (!store) {
      throw new Error('TenantContext disisinda erisim denendi.');
    }
    return store;
  }
}
