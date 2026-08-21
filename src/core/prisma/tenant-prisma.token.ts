import type { tenantScopedExtension } from './tenant-scoped.extension';

export const TENANT_PRISMA = Symbol('TENANT_PRISMA');

export type TenantPrismaClient = ReturnType<typeof tenantScopedExtension>;
