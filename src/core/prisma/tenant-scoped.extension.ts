import { Prisma, PrismaClient } from '@prisma/client';
import { TenantContext } from '../tenant/tenant-context';

/**
 * tenantId kolonu olan modeller. Widget/DatasetField gibi modeller burada yok
 * cunku onlar ust nesneleri (Dashboard/Dataset) uzerinden zaten tenant'a baglanir.
 */
const TENANT_SCOPED_MODELS = new Set<Prisma.ModelName>([
  'User',
  'Invitation',
  'DataSource',
  'Dataset',
  'Dashboard',
  'ScheduledReport',
  'Alert',
  'AuditLog',
]);

const SCOPED_OPERATIONS = new Set([
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'delete',
  'deleteMany',
]);

/**
 * findUnique/findUniqueOrThrow bilerek desteklenmiyor: Prisma'nin unique-where kisiti
 * tenantId'yi where'e eklemeye izin vermez. Tenant-scoped modellerde id ile arama
 * yapmak icin findFirst({ where: { id, ... } }) kullanilmali.
 */
export function tenantScopedExtension<T extends PrismaClient>(client: T) {
  return client.$extends({
    name: 'tenant-scoped',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !TENANT_SCOPED_MODELS.has(model)) {
            return query(args);
          }

          if (operation === 'create') {
            const createArgs = args as { data: Record<string, unknown> };
            const tenantId =
              TenantContext.get()?.tenantId ?? createArgs.data.tenantId;
            if (!tenantId) {
              throw new Error(`tenantId belirlenemedi: ${model}.create`);
            }
            createArgs.data = { ...createArgs.data, tenantId };
            return query(args);
          }

          if (operation === 'createMany') {
            const createManyArgs = args as { data: Record<string, unknown>[] };
            const contextTenantId = TenantContext.get()?.tenantId;
            createManyArgs.data = createManyArgs.data.map((row) => {
              const tenantId = contextTenantId ?? row.tenantId;
              if (!tenantId) {
                throw new Error(`tenantId belirlenemedi: ${model}.createMany`);
              }
              return { ...row, tenantId };
            });
            return query(args);
          }

          if (SCOPED_OPERATIONS.has(operation)) {
            const tenantId = TenantContext.getOrThrow().tenantId;
            const scopedArgs = args as { where?: Record<string, unknown> };
            scopedArgs.where = { ...(scopedArgs.where ?? {}), tenantId };
          }

          return query(args);
        },
      },
    },
  });
}
