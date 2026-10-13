-- DropForeignKey
ALTER TABLE "crm_sales_orders" DROP CONSTRAINT "crm_sales_orders_quoteId_fkey";

-- AlterTable
ALTER TABLE "crm_sales_orders" ALTER COLUMN "quoteId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "crm_sales_order_items" (
    "id" TEXT NOT NULL,
    "salesOrderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_sales_order_items_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "crm_sales_orders" ADD CONSTRAINT "crm_sales_orders_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "crm_quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_sales_order_items" ADD CONSTRAINT "crm_sales_order_items_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "crm_sales_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_sales_order_items" ADD CONSTRAINT "crm_sales_order_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "crm_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
