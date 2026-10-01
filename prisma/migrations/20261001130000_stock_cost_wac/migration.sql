-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('INCREASE', 'DECREASE', 'QUOTE_SALE', 'TRANSFER_OUT', 'TRANSFER_IN', 'CORRECTION');

-- AlterTable
ALTER TABLE "crm_products" DROP COLUMN "costPrice",
ADD COLUMN     "avgCost" DECIMAL(14,4);

-- CreateTable
CREATE TABLE "crm_stock_movements" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unitCost" DECIMAL(14,4),
    "previousAvgCost" DECIMAL(14,4),
    "newAvgCost" DECIMAL(14,4),
    "previousQuantity" DECIMAL(14,3) NOT NULL,
    "newQuantity" DECIMAL(14,3) NOT NULL,
    "quoteId" TEXT,
    "note" TEXT,
    "relatedMovementId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "crm_stock_movements_tenantId_productId_createdAt_idx" ON "crm_stock_movements"("tenantId", "productId", "createdAt");

-- CreateIndex
CREATE INDEX "crm_stock_movements_tenantId_quoteId_idx" ON "crm_stock_movements"("tenantId", "quoteId");

-- AddForeignKey
ALTER TABLE "crm_stock_movements" ADD CONSTRAINT "crm_stock_movements_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_stock_movements" ADD CONSTRAINT "crm_stock_movements_productId_fkey" FOREIGN KEY ("productId") REFERENCES "crm_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_stock_movements" ADD CONSTRAINT "crm_stock_movements_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "crm_warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_stock_movements" ADD CONSTRAINT "crm_stock_movements_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "crm_quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

