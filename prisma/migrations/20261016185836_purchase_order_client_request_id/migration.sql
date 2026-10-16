-- AlterTable
ALTER TABLE "crm_purchase_orders" ADD COLUMN     "clientRequestId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "crm_purchase_orders_tenantId_clientRequestId_key" ON "crm_purchase_orders"("tenantId", "clientRequestId");
