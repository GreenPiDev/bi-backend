-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "PurchaseOrderItemSource" AS ENUM ('QUOTE', 'EXTRA');

-- CreateTable
CREATE TABLE "crm_purchase_orders" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "projectId" TEXT,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "crm_purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_purchase_order_items" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "productId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "source" "PurchaseOrderItemSource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_purchase_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_stock_items" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_stock_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "crm_purchase_orders_tenantId_deletedAt_idx" ON "crm_purchase_orders"("tenantId", "deletedAt");

-- CreateIndex
CREATE INDEX "crm_purchase_orders_tenantId_quoteId_idx" ON "crm_purchase_orders"("tenantId", "quoteId");

-- CreateIndex
CREATE UNIQUE INDEX "crm_purchase_orders_tenantId_orderNumber_key" ON "crm_purchase_orders"("tenantId", "orderNumber");

-- CreateIndex
CREATE INDEX "crm_stock_items_tenantId_idx" ON "crm_stock_items"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "crm_stock_items_tenantId_productId_key" ON "crm_stock_items"("tenantId", "productId");

-- AddForeignKey
ALTER TABLE "crm_purchase_orders" ADD CONSTRAINT "crm_purchase_orders_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_purchase_orders" ADD CONSTRAINT "crm_purchase_orders_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "crm_quotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_purchase_orders" ADD CONSTRAINT "crm_purchase_orders_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "crm_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_purchase_order_items" ADD CONSTRAINT "crm_purchase_order_items_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "crm_purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_purchase_order_items" ADD CONSTRAINT "crm_purchase_order_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "crm_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_stock_items" ADD CONSTRAINT "crm_stock_items_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_stock_items" ADD CONSTRAINT "crm_stock_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "crm_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
