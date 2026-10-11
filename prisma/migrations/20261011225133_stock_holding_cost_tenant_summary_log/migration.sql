-- Stok bekletme maliyeti artik urun bazinda StockMovement satiri yazmiyor (tenant
-- basina gunluk ozet StockHoldingCostLog'a tasindi); eski gecici test kayitlarini sil.
DELETE FROM "crm_stock_movements" WHERE "type" = 'HOLDING_COST';

-- AlterEnum
BEGIN;
CREATE TYPE "StockMovementType_new" AS ENUM ('INCREASE', 'DECREASE', 'QUOTE_SALE', 'TRANSFER_OUT', 'TRANSFER_IN', 'CORRECTION');
ALTER TABLE "crm_stock_movements" ALTER COLUMN "type" TYPE "StockMovementType_new" USING ("type"::text::"StockMovementType_new");
ALTER TYPE "StockMovementType" RENAME TO "StockMovementType_old";
ALTER TYPE "StockMovementType_new" RENAME TO "StockMovementType";
DROP TYPE "public"."StockMovementType_old";
COMMIT;

-- CreateTable
CREATE TABLE "crm_stock_holding_cost_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "monthlyRatePct" DECIMAL(5,2) NOT NULL,
    "productCount" INTEGER NOT NULL,
    "totalCostDelta" DECIMAL(14,2) NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_stock_holding_cost_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "crm_stock_holding_cost_logs_tenantId_createdAt_idx" ON "crm_stock_holding_cost_logs"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "crm_stock_holding_cost_logs" ADD CONSTRAINT "crm_stock_holding_cost_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

