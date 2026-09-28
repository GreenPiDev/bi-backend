-- 1 Project : N Quote (once tersiydi: Project.quoteId @unique). Bir teklif en fazla
-- bir projeye baglidir, FK artik Quote tarafinda. Ayrica PurchaseOrder.projectId
-- kaldirildi - proje iliskisi artik her zaman quote.project uzerinden turetilir
-- (eskiden siparis olusturulduktan sonra teklif<->proje baglantisi kurulursa/degisirse
-- PurchaseOrder.projectId senkronize kalamiyordu).

-- AddColumn
ALTER TABLE "crm_quotes" ADD COLUMN "projectId" TEXT;

-- CreateIndex
CREATE INDEX "crm_quotes_tenantId_projectId_idx" ON "crm_quotes"("tenantId", "projectId");

-- AddForeignKey
ALTER TABLE "crm_quotes" ADD CONSTRAINT "crm_quotes_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "crm_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: mevcut Project.quoteId (1:1) verisini Quote.projectId'ye tasi
UPDATE "crm_quotes" q
SET "projectId" = p."id"
FROM "crm_projects" p
WHERE p."quoteId" = q."id";

-- DropForeignKey
ALTER TABLE "crm_projects" DROP CONSTRAINT "crm_projects_quoteId_fkey";

-- DropIndex
DROP INDEX "crm_projects_quoteId_key";

-- DropColumn
ALTER TABLE "crm_projects" DROP COLUMN "quoteId";

-- DropForeignKey
ALTER TABLE "crm_purchase_orders" DROP CONSTRAINT "crm_purchase_orders_projectId_fkey";

-- DropColumn
ALTER TABLE "crm_purchase_orders" DROP COLUMN "projectId";
