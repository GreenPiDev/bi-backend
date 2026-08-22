import { PrismaService } from '../../src/core/prisma/prisma.service';
import { tenantSchemaName } from '../../src/core/database/identifier';

/**
 * E2E specs run against the real local Postgres DB (see vitest-e2e.config.mts),
 * not a disposable Testcontainer. Deleting only the User rows in afterAll leaves
 * orphaned Tenant rows (and their tenant_<id> physical schema) behind on every
 * run, which pollutes /platform-admin. This removes the full tenant tree.
 */
export async function cleanupTestTenants(
  prisma: PrismaService,
  emailSuffix: string,
): Promise<void> {
  const owners = await prisma.user.findMany({
    where: { email: { endsWith: emailSuffix } },
    select: { tenantId: true },
    distinct: ['tenantId'],
  });
  const tenantIds = owners.map((u) => u.tenantId);
  if (tenantIds.length === 0) return;

  const tenantFilter = { tenantId: { in: tenantIds } };

  await prisma.alert.deleteMany({ where: tenantFilter });
  await prisma.widget.deleteMany({
    where: { dashboard: { tenantId: { in: tenantIds } } },
  });
  await prisma.scheduledReport.deleteMany({ where: tenantFilter });
  await prisma.dashboard.deleteMany({ where: tenantFilter });
  await prisma.datasetField.deleteMany({
    where: { dataset: { tenantId: { in: tenantIds } } },
  });
  await prisma.dataset.deleteMany({ where: tenantFilter });
  await prisma.dataSource.deleteMany({ where: tenantFilter });
  await prisma.invitation.deleteMany({ where: tenantFilter });
  await prisma.auditLog.deleteMany({ where: tenantFilter });
  await prisma.user.deleteMany({ where: tenantFilter });
  await prisma.tenantModule.deleteMany({ where: tenantFilter });
  await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });

  for (const tenantId of tenantIds) {
    await prisma.$executeRawUnsafe(
      `DROP SCHEMA IF EXISTS "${tenantSchemaName(tenantId)}" CASCADE`,
    );
  }
}
