-- AlterTable
ALTER TABLE "crm_sales_order_items" ADD COLUMN     "brand" TEXT,
ADD COLUMN     "discountPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "vatPct" DECIMAL(5,2) NOT NULL DEFAULT 0;
