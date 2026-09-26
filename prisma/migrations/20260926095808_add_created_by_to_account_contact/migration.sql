-- AlterTable
ALTER TABLE "crm_accounts" ADD COLUMN     "createdById" TEXT;

-- AlterTable
ALTER TABLE "crm_contacts" ADD COLUMN     "createdById" TEXT;

-- AlterTable
ALTER TABLE "tenants" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- Backfill: bu alan eklenmeden once olusturulmus kayitlar icin, audit_logs'taki en eski
-- CREATE kaydinin sahibini createdById olarak isaretle (bkz. schema.prisma Account.createdById
-- doc comment'i). Import ile toplu eklenen veya audit log'u herhangi bir nedenle olmayan
-- kayitlar NULL kalir - bu beklenen bir durum, gercek bir olusturan bilinmiyor.
UPDATE "crm_accounts" a
SET "createdById" = sub."userId"
FROM (
  SELECT DISTINCT ON ("entityId") "entityId", "userId"
  FROM "audit_logs"
  WHERE "entity" = 'Account' AND "action" = 'CREATE'
  ORDER BY "entityId", "createdAt" ASC
) sub
WHERE a."id" = sub."entityId" AND a."createdById" IS NULL;

UPDATE "crm_contacts" c
SET "createdById" = sub."userId"
FROM (
  SELECT DISTINCT ON ("entityId") "entityId", "userId"
  FROM "audit_logs"
  WHERE "entity" = 'Contact' AND "action" = 'CREATE'
  ORDER BY "entityId", "createdAt" ASC
) sub
WHERE c."id" = sub."entityId" AND c."createdById" IS NULL;
