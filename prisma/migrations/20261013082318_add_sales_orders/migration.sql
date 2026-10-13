-- CreateEnum
CREATE TYPE "SalesOrderStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY_FOR_SHIPMENT', 'SHIPPED', 'DELIVERED', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "crm_sales_orders" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "contactId" TEXT,
    "status" "SalesOrderStatus" NOT NULL DEFAULT 'PENDING',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_sales_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "crm_sales_orders_quoteId_key" ON "crm_sales_orders"("quoteId");

-- CreateIndex
CREATE INDEX "crm_sales_orders_tenantId_status_idx" ON "crm_sales_orders"("tenantId", "status");

-- CreateIndex
CREATE INDEX "crm_sales_orders_tenantId_accountId_idx" ON "crm_sales_orders"("tenantId", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "crm_sales_orders_tenantId_orderNumber_key" ON "crm_sales_orders"("tenantId", "orderNumber");

-- AddForeignKey
ALTER TABLE "crm_sales_orders" ADD CONSTRAINT "crm_sales_orders_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_sales_orders" ADD CONSTRAINT "crm_sales_orders_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "crm_quotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_sales_orders" ADD CONSTRAINT "crm_sales_orders_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "crm_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_sales_orders" ADD CONSTRAINT "crm_sales_orders_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "crm_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
