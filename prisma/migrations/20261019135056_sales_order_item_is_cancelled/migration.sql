-- AlterTable
ALTER TABLE "crm_quote_items" ADD COLUMN     "isCancelled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "crm_sales_order_items" ADD COLUMN     "isCancelled" BOOLEAN NOT NULL DEFAULT false;
